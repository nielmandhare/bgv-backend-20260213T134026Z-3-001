const VerificationRequest = require('../models/VerificationRequest');
const idfyService = require('./idfyService'); // You'll create this
const logger = require('../utils/logger');

class RetryService {
  constructor() {
    // Retry delays in seconds (exponential backoff)
    this.retryDelays = [5, 15, 45, 120]; // 5s, 15s, 45s, 2min
    this.maxRetries = this.retryDelays.length;
  }

  /**
   * Process all eligible retries
   */
  async processRetryQueue(limit = 50) {
    try {
      logger.info('🔄 Processing retry queue...');
      
      const eligible = await VerificationRequest.findRetryEligible(limit);
      
      if (eligible.length === 0) {
        logger.info('✅ No requests pending retry');
        return { processed: 0 };
      }

      logger.info(`📋 Found ${eligible.length} requests to retry`);
      
      const results = {
        processed: 0,
        succeeded: 0,
        failed: 0,
        scheduled: 0
      };

      for (const request of eligible) {
        try {
          const result = await this.retryRequest(request);
          
          if (result.status === 'completed') {
            results.succeeded++;
          } else if (result.status === 'scheduled') {
            results.scheduled++;
          } else {
            results.failed++;
          }
          
          results.processed++;
          
        } catch (error) {
          logger.error(`❌ Error processing retry for ${request.id}:`, error);
          results.failed++;
        }
      }

      logger.info(`✅ Retry processing complete: ${results.succeeded} succeeded, ${results.scheduled} scheduled, ${results.failed} failed`);
      return results;

    } catch (error) {
      logger.error('❌ Retry queue processing failed:', error);
      throw error;
    }
  }

  /**
   * Retry a single request
   */
  async retryRequest(request) {
    try {
      // Determine which vendor to call based on verification type
      let vendorResponse;
      
      switch (request.verification_type) {
        case 'pan':
          vendorResponse = await idfyService.verifyPAN(
            request.input_data.pan_number,
            request.input_data.name
          );
          break;
        case 'aadhaar':
          vendorResponse = await idfyService.verifyAadhaar(
            request.input_data.aadhaar_number
          );
          break;
        case 'gst':
          vendorResponse = await idfyService.verifyGST(
            request.input_data.gst_number
          );
          break;
        default:
          throw new Error(`Unknown verification type: ${request.verification_type}`);
      }

      // Check if successful
      if (vendorResponse.success) {
        await VerificationRequest.markRetrySuccess(
          request.id,
          vendorResponse.data
        );
        
        logger.info(`✅ Retry succeeded for ${request.id}`);
        return { status: 'completed', requestId: request.id };
        
      } else {
        // Schedule next retry
        return await this.scheduleNextRetry(request, vendorResponse.error);
      }

    } catch (error) {
      // Handle API call failures
      return await this.scheduleNextRetry(request, error.message);
    }
  }

  /**
   * Schedule next retry attempt
   */
  async scheduleNextRetry(request, error) {
    const nextAttempt = request.retry_count + 1;
    
    if (nextAttempt >= this.maxRetries) {
      // Max retries reached, mark as permanently failed
      await VerificationRequest.markAsPermanentlyFailed(
        request.id,
        `Max retries (${this.maxRetries}) exceeded. Last error: ${error}`
      );
      
      logger.warn(`⚠️ Max retries reached for ${request.id}`);
      return { status: 'failed', requestId: request.id };
      
    } else {
      // Schedule next retry with exponential backoff
      const delaySeconds = this.retryDelays[nextAttempt];
      
      await VerificationRequest.scheduleRetry(
        request.id,
        delaySeconds,
        error
      );
      
      logger.info(`⏰ Scheduled retry for ${request.id} in ${delaySeconds}s (attempt ${nextAttempt + 1}/${this.maxRetries})`);
      return { 
        status: 'scheduled', 
        requestId: request.id,
        nextAttemptIn: delaySeconds,
        attempt: nextAttempt + 1
      };
    }
  }

  /**
   * Manual retry for specific request
   */
  async manualRetry(requestId, tenantId) {
    const request = await VerificationRequest.findById(requestId, tenantId);
    
    if (!request) {
      throw new Error('Request not found');
    }

    if (request.status !== 'failed') {
      throw new Error(`Cannot retry request with status: ${request.status}`);
    }

    // Reset retry count and attempt immediately
    await VerificationRequest.resetRetryCount(requestId);
    
    // Process immediately
    const result = await this.retryRequest({
      ...request,
      retry_count: 0
    });

    return result;
  }

  /**
   * Get retry statistics
   */
  async getRetryStats(tenantId) {
    const result = await db.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'failed' AND retry_count < max_retries) as pending_retry,
        COUNT(*) FILTER (WHERE status = 'failed' AND retry_count >= max_retries) as permanently_failed,
        AVG(retry_count) FILTER (WHERE status = 'completed') as avg_retries_to_success,
        SUM(retry_count) as total_retry_attempts
       FROM verification_requests
       WHERE tenant_id = $1`,
      [tenantId]
    );
    return result.rows[0];
  }
}

module.exports = new RetryService();
