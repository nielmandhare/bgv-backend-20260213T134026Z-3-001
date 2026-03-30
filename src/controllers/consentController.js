const ConsentRecord = require('../models/ConsentRecord');
const ConsentValidator = require('../utils/consentValidator');
const logger = require('../utils/logger');

const consentController = {
  getMyConsents: async (req, res) => {
    try {
      const { user_id, tenant_id } = req.user;
      const consents = await ConsentRecord.findByUser(user_id, tenant_id, true);
      res.json({ success: true, data: ConsentValidator.formatConsentResponse(consents) });
    } catch (error) {
      logger.error('❌ Get consents error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getConsentByType: async (req, res) => {
    try {
      const { user_id, tenant_id } = req.user;
      const { type } = req.params;
      const consent = await ConsentRecord.getLatestConsent(user_id, tenant_id, type);
      if (!consent) {
        return res.status(404).json({ success: false, error: `No consent found for type: ${type}` });
      }
      res.json({
        success: true,
        data: {
          type: consent.consent_type,
          accepted: true,
          accepted_at: consent.consented_at,
          version: consent.version,
          text: ConsentValidator.getConsentText(type, consent.version),
          ip_address: consent.ip_address,
          is_active: consent.is_active
        }
      });
    } catch (error) {
      logger.error('❌ Get consent by type error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // FIXED: Accept consent with correct parameter order
  acceptConsent: async (req, res) => {
    try {
      const { user_id, tenant_id } = req.user;
      const { consent_type, version = '1.0' } = req.body;
      
      if (!consent_type) {
        return res.status(400).json({ success: false, error: 'consent_type is required' });
      }

      // Check if already has active consent - order: user_id, tenant_id, consent_type
      const existing = await ConsentRecord.getLatestConsent(user_id, tenant_id, consent_type);
      
      if (existing && existing.is_active) {
        return res.json({
          success: true,
          message: 'Consent already accepted',
          data: { type: consent_type, accepted_at: existing.consented_at, version: existing.version }
        });
      }

      const subject_name = req.user?.email || 'User';
      const consent = await ConsentRecord.create({
        user_id,
        tenant_id,
        consent_type,
        consent_text: ConsentValidator.getConsentText(consent_type, version),
        version,
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        subject_name: subject_name
      });

      logger.info(`✅ Consent accepted: ${consent_type} for user ${user_id}`);

      res.status(201).json({
        success: true,
        message: 'Consent recorded successfully',
        data: { id: consent.id, type: consent.consent_type, accepted_at: consent.consented_at, version: consent.version }
      });

    } catch (error) {
      logger.error('❌ Accept consent error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  withdrawConsent: async (req, res) => {
    try {
      const { user_id } = req.user;
      const { consentId } = req.params;
      const consent = await ConsentRecord.withdrawConsent(consentId, user_id);
      if (!consent) {
        return res.status(404).json({ success: false, error: 'Consent record not found' });
      }
      logger.info(`⚠️ Consent withdrawn: ${consent.consent_type} for user ${user_id}`);
      res.json({ success: true, message: 'Consent withdrawn successfully', data: { id: consent.id, type: consent.consent_type, withdrawn_at: consent.withdrawn_at } });
    } catch (error) {
      logger.error('❌ Withdraw consent error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getRequiredConsents: async (req, res) => {
    try {
      const { verificationType } = req.params;
      const required = ConsentValidator.getRequiredConsents(verificationType);
      const consents = required.map(type => ({ type, text: ConsentValidator.getConsentText(type), required: true, version: '1.0' }));
      res.json({ success: true, data: consents });
    } catch (error) {
      logger.error('❌ Get required consents error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getConsentStats: async (req, res) => {
    try {
      const { tenant_id } = req.user;
      const stats = await ConsentRecord.getStats(tenant_id);
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('❌ Get consent stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  bulkAcceptConsents: async (req, res) => {
    try {
      const { user_id, tenant_id } = req.user;
      const { consents } = req.body;
      if (!consents || !Array.isArray(consents) || consents.length === 0) {
        return res.status(400).json({ success: false, error: 'consents array is required' });
      }
      const subject_name = req.user?.email || 'User';
      const results = { successful: [], failed: [] };
      for (const item of consents) {
        try {
          const consent = await ConsentRecord.create({
            user_id,
            tenant_id,
            consent_type: item.type,
            consent_text: ConsentValidator.getConsentText(item.type, item.version || '1.0'),
            version: item.version || '1.0',
            ip_address: req.ip,
            user_agent: req.get('User-Agent'),
            subject_name: subject_name,
            metadata: { bulk: true }
          });
          results.successful.push({ type: item.type, id: consent.id, accepted_at: consent.consented_at });
        } catch (error) {
          results.failed.push({ type: item.type, error: error.message });
        }
      }
      logger.info(`✅ Bulk consent recorded: ${results.successful.length} successful, ${results.failed.length} failed`);
      res.status(201).json({ success: true, message: 'Bulk consent processing complete', data: results });
    } catch (error) {
      logger.error('❌ Bulk accept consents error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = consentController;
