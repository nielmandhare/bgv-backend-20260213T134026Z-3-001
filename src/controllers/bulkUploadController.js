const bulkUploadService = require('../services/bulkUploadService');
const BulkUploadBatch = require('../models/BulkUploadBatch');
const VerificationRequest = require('../models/VerificationRequest');
const Document = require('../models/Document');
const logger = require('../utils/logger');
const db = require('../utils/db');

const bulkUploadController = {
  // Upload multiple files
  uploadFiles: async (req, res) => {
    try {
      const { tenant_id, user_id } = req.user;
      const files = req.files;
      const batch = req.batch; // From createBatchMiddleware

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
      }

      logger.info(`📦 Batch ${batch.id}: ${files.length} files received`);

      // Return 202 Accepted immediately
      res.status(202).json({
        success: true,
        message: 'Batch created, processing started',
        data: {
          batch_id: batch.id,
          batch_reference: batch.batch_id,
          total_files: files.length,
          status: 'processing',
          message: 'Files are being processed in the background',
          check_status: `GET /api/bulk-upload/batches/${batch.id}`,
          check_results: `GET /api/bulk-upload/batches/${batch.id}/results`
        }
      });

      // Process files in background (don't await)
      setImmediate(() => {
        bulkUploadService.processFilesAsync(batch.id, files, tenant_id, user_id)
          .catch(err => logger.error('Background processing failed:', err));
      });

    } catch (error) {
      logger.error('❌ Upload files error:', error);
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Upload CSV/Excel for bulk verification (ENHANCED)
  uploadCsv: async (req, res) => {
    try {
      const { tenant_id, user_id } = req.user;
      const { verification_type } = req.body;
      const file = req.file;
      const batch = req.batch; // From createBatchMiddleware

      if (!file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      if (!verification_type) {
        return res.status(400).json({
          success: false,
          error: 'verification_type is required (pan, aadhaar, gst, bank, education, employment, court, voter, driving)'
        });
      }

      // Validate file type
      const fileExt = file.originalname.split('.').pop().toLowerCase();
      if (!['csv', 'xlsx', 'xls'].includes(fileExt)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file type. Please upload CSV or Excel file.'
        });
      }

      logger.info(`📊 Batch ${batch.id}: File ${file.originalname} for ${verification_type}`);

      // Return 202 Accepted immediately
      res.status(202).json({
        success: true,
        message: 'Batch created, processing started',
        data: {
          batch_id: batch.id,
          batch_reference: batch.batch_id,
          file_name: file.originalname,
          verification_type,
          status: 'processing',
          message: 'Your file is being processed in the background. You will receive an email when complete.',
          check_status: `GET /api/bulk-upload/batches/${batch.id}`,
          check_results: `GET /api/bulk-upload/batches/${batch.id}/results`,
          download_errors: `GET /api/bulk-upload/batches/${batch.id}/errors`
        }
      });

      // Process in background using the enhanced method
      setImmediate(() => {
        bulkUploadService.processBulkFile(
          batch.id, 
          file, 
          tenant_id, 
          user_id, 
          verification_type
        )
          .then(result => {
            logger.info(`✅ Batch ${batch.id} processing complete: ${result.successful}/${result.total} successful`);
          })
          .catch(err => logger.error('Background file processing failed:', err));
      });

    } catch (error) {
      logger.error('❌ Upload CSV error:', error);
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Get batch status by ID
  getBatchStatus: async (req, res) => {
    try {
      const { batchId } = req.params;
      const { tenant_id } = req.user;

      const batch = await BulkUploadBatch.findById(batchId);

      if (!batch) {
        return res.status(404).json({
          success: false,
          error: 'Batch not found'
        });
      }

      // Verify tenant owns this batch
      if (batch.tenant_id !== tenant_id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Get document statistics
      const docStats = await Document.getBatchStats(batchId);
      
      // Get verification request statistics
      const verificationStats = await VerificationRequest.getBatchStats(batchId, tenant_id);

      // Calculate progress percentage
      const progress = batch.total_rows > 0 
        ? Math.round(((batch.successful_rows + batch.failed_rows) / batch.total_rows) * 100)
        : 0;

      res.json({
        success: true,
        data: {
          id: batch.id,
          batch_reference: batch.batch_id,
          file_name: batch.file_name,
          total: batch.total_rows,
          successful: batch.successful_rows,
          failed: batch.failed_rows,
          status: batch.status,
          progress: progress,
          error_file_url: batch.error_file_url,
          created_at: batch.created_at,
          started_at: batch.started_at,
          completed_at: batch.completed_at,
          stats: {
            documents: docStats,
            verifications: verificationStats || {
              total: 0,
              pending: 0,
              completed: 0,
              failed: 0
            }
          }
        }
      });

    } catch (error) {
      logger.error('❌ Get batch status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // ========== NEW: Get detailed batch results with verification requests ==========
  getBatchResults: async (req, res) => {
    try {
      const { batchId } = req.params;
      const { tenant_id } = req.user;

      const batchDetails = await bulkUploadService.getBatchDetails(batchId, tenant_id);

      if (!batchDetails) {
        return res.status(404).json({
          success: false,
          error: 'Batch not found or access denied'
        });
      }

      res.json({
        success: true,
        data: batchDetails
      });

    } catch (error) {
      logger.error('❌ Get batch results error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // ========== NEW: Download error report ==========
  downloadErrorReport: async (req, res) => {
    try {
      const { batchId } = req.params;
      const { tenant_id } = req.user;

      const batch = await BulkUploadBatch.findById(batchId);

      if (!batch) {
        return res.status(404).json({
          success: false,
          error: 'Batch not found'
        });
      }

      if (batch.tenant_id !== tenant_id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      if (!batch.error_file_url) {
        return res.status(404).json({
          success: false,
          error: 'No error report available for this batch'
        });
      }

      // Check if file exists
      const fs = require('fs');
      if (!fs.existsSync(batch.error_file_url)) {
        return res.status(404).json({
          success: false,
          error: 'Error report file not found on server'
        });
      }

      // Send file for download
      res.download(batch.error_file_url, `errors-${batch.batch_id}.csv`, (err) => {
        if (err) {
          logger.error('❌ Error sending file:', err);
          res.status(500).json({
            success: false,
            error: 'Error downloading file'
          });
        }
      });

    } catch (error) {
      logger.error('❌ Download error report error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get all batches for current tenant (ENHANCED)
  getBatches: async (req, res) => {
    try {
      const { tenant_id } = req.user;
      const limit = req.query.limit ? parseInt(req.query.limit) : 20;

      const batchesWithStats = await bulkUploadService.getAllBatchesWithSummary(tenant_id, limit);

      res.json({
        success: true,
        data: batchesWithStats
      });

    } catch (error) {
      logger.error('❌ Get batches error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get all documents in a batch
  getBatchDocuments: async (req, res) => {
    try {
      const { batchId } = req.params;
      const { tenant_id } = req.user;

      // Verify batch exists and belongs to tenant
      const batch = await BulkUploadBatch.findById(batchId);
      
      if (!batch) {
        return res.status(404).json({
          success: false,
          error: 'Batch not found'
        });
      }

      if (batch.tenant_id !== tenant_id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const documents = await Document.findByBatch(batchId);

      res.json({
        success: true,
        data: documents.map(doc => ({
          id: doc.id,
          file_name: doc.file_name,
          document_type: doc.document_type,
          file_size: doc.file_size,
          status: doc.status,
          row_number: doc.row_number,
          created_at: doc.created_at,
          metadata: doc.metadata
        }))
      });

    } catch (error) {
      logger.error('❌ Get batch documents error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get batch statistics summary
  getBatchStats: async (req, res) => {
    try {
      const { tenant_id } = req.user;

      const stats = await BulkUploadBatch.getStats(tenant_id);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('❌ Get batch stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // ========== NEW: Retry failed rows in a batch ==========
  retryFailedRows: async (req, res) => {
    try {
      const { batchId } = req.params;
      const { tenant_id, user_id } = req.user;

      const batch = await BulkUploadBatch.findById(batchId);

      if (!batch) {
        return res.status(404).json({
          success: false,
          error: 'Batch not found'
        });
      }

      if (batch.tenant_id !== tenant_id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Check if there are failed rows to retry
      if (batch.failed_rows === 0) {
        return res.status(400).json({
          success: false,
          error: 'No failed rows to retry'
        });
      }

      res.status(202).json({
        success: true,
        message: 'Retry started for failed rows',
        data: {
          batch_id: batchId,
          failed_count: batch.failed_rows,
          status: 'retrying'
        }
      });

      // Process retry in background
      setImmediate(async () => {
        try {
          await bulkUploadService.retryFailedRows(batchId, tenant_id, user_id);
        } catch (error) {
          logger.error(`❌ Retry failed for batch ${batchId}:`, error);
        }
      });

    } catch (error) {
      logger.error('❌ Retry failed rows error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // ========== NEW: Cancel/Delete batch ==========
  cancelBatch: async (req, res) => {
    try {
      const { batchId } = req.params;
      const { tenant_id } = req.user;

      const batch = await BulkUploadBatch.findById(batchId);

      if (!batch) {
        return res.status(404).json({
          success: false,
          error: 'Batch not found'
        });
      }

      if (batch.tenant_id !== tenant_id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Soft delete the batch
      await db.query(
        'UPDATE bulk_upload_batches SET deleted_at = NOW() WHERE id = $1',
        [batchId]
      );

      // Soft delete all associated verification requests
      await VerificationRequest.deleteBatch(batchId, tenant_id);

      res.json({
        success: true,
        message: 'Batch cancelled successfully',
        data: { batch_id: batchId }
      });

    } catch (error) {
      logger.error('❌ Cancel batch error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Retry failed batch (legacy - keeping for compatibility)
  retryBatch: async (req, res) => {
    try {
      const { batchId } = req.params;
      const { tenant_id } = req.user;

      const batch = await BulkUploadBatch.findById(batchId);

      if (!batch) {
        return res.status(404).json({
          success: false,
          error: 'Batch not found'
        });
      }

      if (batch.tenant_id !== tenant_id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Reset batch for retry
      await db.query(
        `UPDATE bulk_upload_batches 
         SET status = 'processing', 
             started_at = NOW(),
             successful_rows = 0,
             failed_rows = 0 
         WHERE id = $1`,
        [batchId]
      );

      res.json({
        success: true,
        message: 'Batch retry started',
        data: { batch_id: batchId }
      });

      // TODO: Trigger reprocessing based on batch type

    } catch (error) {
      logger.error('❌ Retry batch error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};

module.exports = bulkUploadController;
