const retryService = require('../services/retryService');
const VerificationRequest = require('../models/VerificationRequest');
const logger = require('../utils/logger');

const retryController = {
  /**
   * Manually retry a failed verification
   */
  manualRetry: async (req, res) => {
    try {
      const { requestId } = req.params;
      const { tenant_id } = req.user;

      const result = await retryService.manualRetry(requestId, tenant_id);

      res.json({
        success: true,
        message: 'Retry initiated',
        data: result
      });

    } catch (error) {
      logger.error('❌ Manual retry error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Get retry history for a request
   */
  getRetryHistory: async (req, res) => {
    try {
      const { requestId } = req.params;
      const { tenant_id } = req.user;

      const request = await VerificationRequest.findById(requestId, tenant_id);
      
      if (!request) {
        return res.status(404).json({
          success: false,
          error: 'Request not found'
        });
      }

      const history = await VerificationRequest.getRetryHistory(requestId);

      res.json({
        success: true,
        data: history
      });

    } catch (error) {
      logger.error('❌ Get retry history error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Get retry statistics for tenant
   */
  getRetryStats: async (req, res) => {
    try {
      const { tenant_id } = req.user;
      
      const stats = await retryService.getRetryStats(tenant_id);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('❌ Get retry stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Trigger retry queue processing (admin only)
   */
  triggerRetryQueue: async (req, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      // Process queue (non-blocking)
      setImmediate(async () => {
        try {
          const retryJob = require('../jobs/retryJob');
          await retryJob.execute();
        } catch (error) {
          logger.error('❌ Manual retry queue trigger failed:', error);
        }
      });

      res.json({
        success: true,
        message: 'Retry queue processing triggered'
      });

    } catch (error) {
      logger.error('❌ Trigger retry queue error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Cancel scheduled retry for a request
   */
  cancelRetry: async (req, res) => {
    try {
      const { requestId } = req.params;
      const { tenant_id } = req.user;

      const request = await VerificationRequest.findById(requestId, tenant_id);
      
      if (!request) {
        return res.status(404).json({
          success: false,
          error: 'Request not found'
        });
      }

      // Mark as permanently failed
      await VerificationRequest.markAsPermanentlyFailed(
        requestId,
        'Retry cancelled by user'
      );

      res.json({
        success: true,
        message: 'Retry cancelled'
      });

    } catch (error) {
      logger.error('❌ Cancel retry error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};

module.exports = retryController;
