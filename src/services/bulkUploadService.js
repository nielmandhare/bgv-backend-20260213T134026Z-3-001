const fs = require('fs');
const path = require('path');
const db = require('../utils/db');
const BulkUploadBatch = require('../models/BulkUploadBatch');
const VerificationRequest = require('../models/VerificationRequest');
const Document = require('../models/Document');
const CsvParser = require('../utils/csvParser');
const ExcelParser = require('../utils/excelParser');
const logger = require('../utils/logger');

class BulkUploadService {
  // Create a new batch
  async createBatch(tenantId, userId, fileName, metadata = {}) {
    const batch = await BulkUploadBatch.create({
      tenant_id: tenantId,
      uploaded_by: userId,
      file_name: fileName,
      total_rows: metadata.fileCount || 0,
      metadata: metadata
    });
    logger.info(`📦 Batch created: ${batch.id}`);
    return batch;
  }

  // Process multiple files in background
  async processFilesAsync(batchId, files, tenantId, userId) {
    const results = { 
      total: files?.length || 0, 
      successful: 0, 
      failed: 0, 
      errors: [] 
    };

    try {
      await BulkUploadBatch.startProcessing(batchId);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          // Store file in database
          await Document.createFromBulk({
            tenant_id: tenantId,
            uploaded_by: userId,
            document_type: this.getDocumentType(file.originalname),
            file_name: file.originalname,
            file_path: file.path,
            file_size: file.size,
            mime_type: file.mimetype,
            batch_id: batchId,
            row_number: i + 1
          });
          results.successful++;
          logger.info(`✅ File ${i+1}/${files.length} processed: ${file.originalname}`);
        } catch (error) {
          results.failed++;
          results.errors.push({ 
            file: file.originalname, 
            error: error.message 
          });
          logger.error(`❌ File failed: ${file.originalname} - ${error.message}`);
          
          // Clean up failed file
          try { 
            fs.unlinkSync(file.path); 
          } catch (e) {}
        }
      }

      // Update batch progress
      await BulkUploadBatch.updateProgress(
        batchId,
        results.successful,
        results.failed,
        results.failed === 0 ? 'completed' : 'partially_failed'
      );
      
      logger.info(`✅ Batch ${batchId}: ${results.successful}/${results.total} successful`);
      
      if (results.failed > 0) {
        logger.warn(`⚠️ Batch ${batchId}: ${results.failed} files failed`);
      }
    } catch (error) {
      logger.error(`❌ Batch ${batchId} processing failed:`, error);
      await BulkUploadBatch.updateProgress(batchId, 0, 0, 'failed');
    }
  }

  // ========== NEW ENHANCED BULK FILE PROCESSING ==========
  
  // Process CSV/Excel file and create verification requests
  async processBulkFile(batchId, file, tenantId, userId, verificationType) {
    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      errors: [],
      requests: []
    };

    try {
      await BulkUploadBatch.startProcessing(batchId);

      // Detect file type and parse accordingly
      let rows = [];
      const fileExt = path.extname(file.originalname).toLowerCase();
      
      if (fileExt === '.csv') {
        rows = await CsvParser.parse(file.path);
      } else if (['.xlsx', '.xls'].includes(fileExt)) {
        const ExcelParser = require('../utils/excelParser');
        rows = await ExcelParser.parse(file.path);
      } else {
        throw new Error('Unsupported file type. Please upload CSV or Excel file.');
      }

      results.total = rows.length;

      // Update total rows in batch
      await db.query(
        'UPDATE bulk_upload_batches SET total_rows = $1 WHERE id = $2',
        [rows.length, batchId]
      );

      // Process each row using VerificationRequest.createFromBulk
      const bulkResults = await VerificationRequest.createFromBulk(
        rows,
        tenantId,
        userId,
        verificationType,
        batchId
      );

      results.successful = bulkResults.successful.length;
      results.failed = bulkResults.failed.length;
      results.requests = bulkResults.successful;
      results.errors = bulkResults.failed;

      // Update batch progress in database
      await db.query(
        'UPDATE bulk_upload_batches SET successful_rows = $1, failed_rows = $2 WHERE id = $3',
        [results.successful, results.failed, batchId]
      );

      // Generate error report if any failures
      let errorFileUrl = null;
      if (results.failed > 0) {
        errorFileUrl = CsvParser.generateErrorReport(results.errors, file.path);
        await BulkUploadBatch.completeWithErrors(batchId, errorFileUrl);
        
        // Update batch status based on results
        if (results.successful > 0) {
          await BulkUploadBatch.updateProgress(batchId, 0, 0, 'partially_completed');
        } else {
          await BulkUploadBatch.updateProgress(batchId, 0, 0, 'failed');
        }
      } else {
        await BulkUploadBatch.updateProgress(batchId, 0, 0, 'completed');
      }

      // Clean up the uploaded file
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        // Ignore cleanup errors
      }

      logger.info(`✅ Bulk file ${batchId} processed: ${results.successful}/${results.total} successful`);

      return {
        ...results,
        error_file_url: errorFileUrl
      };

    } catch (error) {
      logger.error(`❌ Bulk file ${batchId} failed:`, error);
      await BulkUploadBatch.updateProgress(batchId, 0, 0, 'failed');
      throw error;
    }
  }

  // Keep the old method name for compatibility (now uses new method)
  async processCsvAsync(batchId, file, tenantId, userId, verificationType) {
    return this.processBulkFile(batchId, file, tenantId, userId, verificationType);
  }

  // ========== BATCH RETRY METHODS ==========

  // Retry failed rows in a batch
  async retryFailedRows(batchId, tenantId, userId) {
    try {
      // Get the batch
      const batch = await BulkUploadBatch.findById(batchId);
      
      if (!batch) {
        throw new Error('Batch not found');
      }

      // Get failed verification requests for this batch
      const failedRequests = await db.query(
        `SELECT * FROM verification_requests 
         WHERE tenant_id = $1 
           AND metadata->>'batch_id' = $2 
           AND status = 'failed'`,
        [tenantId, batchId]
      );

      if (failedRequests.rows.length === 0) {
        return {
          success: true,
          message: 'No failed rows to retry',
          retried: 0
        };
      }

      // Reset batch for retry
      await BulkUploadBatch.updateProgress(batchId, 0, 0, 'processing');

      const results = {
        total: failedRequests.rows.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      // Process each failed request
      for (const request of failedRequests.rows) {
        try {
          // Update status back to pending
          await VerificationRequest.updateStatus(request.id, 'pending');
          
          // TODO: Trigger verification process
          // This will be handled by a separate job
          
          results.successful++;
          
        } catch (error) {
          results.failed++;
          results.errors.push({
            request_id: request.id,
            row: request.metadata?.row_number,
            error: error.message
          });
        }
      }

      // Update batch progress
      await db.query(
        'UPDATE bulk_upload_batches SET successful_rows = $1, failed_rows = $2 WHERE id = $3',
        [results.successful, results.failed, batchId]
      );

      logger.info(`🔄 Retry batch ${batchId}: ${results.successful}/${results.total} retried`);

      return results;

    } catch (error) {
      logger.error(`❌ Retry batch ${batchId} failed:`, error);
      throw error;
    }
  }

  // Get document type from filename
  getDocumentType(filename) {
    const lower = filename.toLowerCase();
    if (lower.includes('pan')) return 'pan';
    if (lower.includes('aadhaar')) return 'aadhaar';
    if (lower.includes('gst')) return 'gst';
    if (lower.includes('udyam')) return 'udyam';
    if (lower.includes('voter')) return 'voter_id';
    if (lower.includes('driving') || lower.includes('license')) return 'driving_license';
    if (lower.includes('education') || lower.includes('degree')) return 'education';
    if (lower.includes('employment')) return 'employment';
    return 'other';
  }

  // Validate CSV row based on verification type (kept for backward compatibility)
  validateRow(row, verificationType) {
    const requiredFields = {
      pan: ['pan_number', 'name'],
      aadhaar: ['aadhaar_number', 'name'],
      gst: ['gst_number', 'business_name'],
      education: ['institute', 'degree', 'year'],
      employment: ['employer', 'designation', 'duration']
    };
    
    const fields = requiredFields[verificationType] || ['name'];
    const missing = fields.filter(f => !row[f] || String(row[f]).trim() === '');
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // Format-specific validations
    if (verificationType === 'pan' && row.pan_number) {
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (!panRegex.test(row.pan_number)) {
        throw new Error('Invalid PAN format. Should be 5 letters + 4 numbers + 1 letter');
      }
    }

    if (verificationType === 'aadhaar' && row.aadhaar_number) {
      const aadhaarRegex = /^\d{12}$/;
      if (!aadhaarRegex.test(row.aadhaar_number)) {
        throw new Error('Invalid Aadhaar format. Should be 12 digits');
      }
    }

    return true;
  }

  // Get batch details with verification requests
  async getBatchDetails(batchId, tenantId) {
    const batch = await BulkUploadBatch.findById(batchId);
    
    if (!batch || batch.tenant_id !== tenantId) {
      return null;
    }

    const requests = await VerificationRequest.findByBatchId(batchId, tenantId);
    const stats = await VerificationRequest.getBatchStats(batchId, tenantId);

    return {
      batch,
      stats,
      requests: requests.map(r => ({
        id: r.id,
        row: r.metadata?.row_number,
        status: r.status,
        input_data: r.input_data,
        created_at: r.created_at,
        completed_at: r.completed_at
      }))
    };
  }

  // Get all batches with summary
  async getAllBatchesWithSummary(tenantId, limit = 20) {
    const batches = await BulkUploadBatch.findByTenant(tenantId, limit);
    
    const batchesWithStats = await Promise.all(
      batches.map(async (batch) => {
        const stats = await VerificationRequest.getBatchStats(batch.id, tenantId);
        const docStats = await Document.getBatchStats(batch.id);
        
        return {
          ...batch,
          verification_stats: stats || {
            total: 0,
            pending: 0,
            completed: 0,
            failed: 0
          },
          document_stats: docStats
        };
      })
    );

    return batchesWithStats;
  }
}

module.exports = new BulkUploadService();