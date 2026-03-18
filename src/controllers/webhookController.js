const responseProcessor = require('../services/responseProcessor');
const VerificationRequest = require('../models/VerificationRequest');
const VerificationResult = require('../models/VerificationResult');
const logger = require('../utils/logger');

const webhookController = {
  handleIDfyWebhook: async (req, res) => {
    try {
      logger.info('📨 Received IDfy webhook');
      
      const payload = req.body;
      const vendorReferenceId = payload.request_id || payload.id;

      const verification = await VerificationRequest.findByVendorId(vendorReferenceId);
      
      if (!verification) {
        logger.warn(`⚠️ Unknown vendor reference: ${vendorReferenceId}`);
        return res.status(404).json({ error: 'Verification not found' });
      }

      const processed = responseProcessor.process(
        'idfy',
        payload,
        verification.verification_type
      );

      const result = await VerificationResult.create({
        verification_request_id: verification.id,
        vendor: 'idfy',
        verification_type: verification.verification_type,
        status: processed.status,
        verified: processed.verified,
        confidence_score: processed.confidence_score,
        result_data: processed.result,
        raw_response: payload,
        metadata: processed.metadata
      });

      await VerificationRequest.updateStatus(
        verification.id,
        processed.status,
        processed.result
      );

      logger.info(`✅ Processed webhook for ${verification.id}`);

      res.status(200).json({
        success: true,
        message: 'Webhook processed',
        result_id: result.id
      });

    } catch (error) {
      logger.error('❌ Webhook processing error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  handleGridlinesWebhook: async (req, res) => {
    try {
      logger.info('📨 Received Gridlines webhook');
      
      const payload = req.body;
      const vendorReferenceId = payload.transaction_id || payload.id;

      const verification = await VerificationRequest.findByVendorId(vendorReferenceId);
      
      if (!verification) {
        logger.warn(`⚠️ Unknown vendor reference: ${vendorReferenceId}`);
        return res.status(404).json({ error: 'Verification not found' });
      }

      const processed = responseProcessor.process(
        'gridlines',
        payload,
        verification.verification_type
      );

      const result = await VerificationResult.create({
        verification_request_id: verification.id,
        vendor: 'gridlines',
        verification_type: verification.verification_type,
        status: processed.status,
        verified: processed.verified,
        confidence_score: processed.confidence_score,
        result_data: processed.result,
        raw_response: payload,
        metadata: processed.metadata
      });

      await VerificationRequest.updateStatus(
        verification.id,
        processed.status,
        processed.result
      );

      logger.info(`✅ Processed webhook for ${verification.id}`);

      res.status(200).json({
        success: true,
        message: 'Webhook processed',
        result_id: result.id
      });

    } catch (error) {
      logger.error('❌ Webhook processing error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  getResult: async (req, res) => {
    try {
      const { requestId } = req.params;
      const { tenant_id } = req.user;

      const verification = await VerificationRequest.findById(requestId, tenant_id);
      
      if (!verification) {
        return res.status(404).json({ error: 'Verification not found' });
      }

      const result = await VerificationResult.findByRequestId(requestId);

      res.json({
        success: true,
        data: {
          verification,
          result: result || null
        }
      });

    } catch (error) {
      logger.error('❌ Get result error:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = webhookController;
