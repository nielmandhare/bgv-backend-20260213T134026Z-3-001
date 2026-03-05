const VerificationRequest = require('../models/VerificationRequest');
const ConsentRecord = require('../models/ConsentRecord');
const ConsentValidator = require('../utils/consentValidator');
const logger = require('../utils/logger');
const db = require('../utils/db');

const verificationController = {
  // Create a new verification request with consent
  createVerification: async (req, res) => {
    try {
      const { tenant_id, user_id } = req.user;
      const { verification_type, input_data, consent } = req.body;

      // Validate required fields
      if (!verification_type) {
        return res.status(400).json({
          success: false,
          error: 'verification_type is required'
        });
      }

      if (!input_data) {
        return res.status(400).json({
          success: false,
          error: 'input_data is required'
        });
      }

      // Check if consent was provided
      if (!consent || !consent.accepted) {
        return res.status(400).json({
          success: false,
          error: 'Consent required',
          message: 'You must accept the terms and conditions',
          requiredConsents: ConsentValidator.getRequiredConsents(verification_type)
        });
      }

      // Create verification request
      const verification = await VerificationRequest.create({
        tenant_id,
        requested_by: user_id,
        verification_type,
        input_data,
        metadata: {
          source: 'api',
          consent_provided: true,
          consent_time: new Date().toISOString()
        }
      });

      // Save consent record
      await ConsentRecord.create({
        user_id,
        tenant_id,
        verification_request_id: verification.id,
        consent_type: 'data_processing',
        consent_text: ConsentValidator.getConsentText('data_processing'),
        version: '1.0',
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        metadata: {
          verification_type,
          input_fields: Object.keys(input_data)
        }
      });

      logger.info(`✅ Verification created: ${verification.id} with consent`);

      res.status(201).json({
        success: true,
        message: 'Verification request created successfully',
        data: {
          id: verification.id,
          verification_type: verification.verification_type,
          status: verification.status,
          created_at: verification.created_at,
          consent_recorded: true
        }
      });

    } catch (error) {
      logger.error('❌ Create verification error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get verification by ID
  getVerificationById: async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.user;

      const result = await db.query(
        'SELECT * FROM verification_requests WHERE id = $1',
        [id]
      );
      
      const verification = result.rows[0];

      if (!verification) {
        return res.status(404).json({
          success: false,
          error: 'Verification not found'
        });
      }

      // Check tenant access
      if (verification.tenant_id !== tenant_id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Get associated consent record
      const consent = await ConsentRecord.findByRequestId(id);

      res.json({
        success: true,
        data: {
          ...verification,
          consent: consent ? {
            id: consent.id,
            consented_at: consent.consented_at,
            ip_address: consent.ip_address,
            consent_type: consent.consent_type
          } : null
        }
      });

    } catch (error) {
      logger.error('❌ Get verification error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get all verifications for tenant
  getVerifications: async (req, res) => {
    try {
      const { tenant_id } = req.user;
      const { status, limit = 50, offset = 0 } = req.query;

      let query = 'SELECT * FROM verification_requests WHERE tenant_id = $1';
      const params = [tenant_id];
      let paramCount = 2;

      if (status) {
        query += ` AND status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await db.query(query, params);

      res.json({
        success: true,
        data: result.rows,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: result.rows.length
        }
      });

    } catch (error) {
      logger.error('❌ Get verifications error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get consent for verification
  getVerificationConsent: async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.user;

      const result = await db.query(
        'SELECT * FROM verification_requests WHERE id = $1',
        [id]
      );
      
      const verification = result.rows[0];

      if (!verification) {
        return res.status(404).json({
          success: false,
          error: 'Verification not found'
        });
      }

      if (verification.tenant_id !== tenant_id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const consent = await ConsentRecord.findByRequestId(id);

      if (!consent) {
        return res.status(404).json({
          success: false,
          error: 'No consent record found for this verification'
        });
      }

      res.json({
        success: true,
        data: {
          verification_id: id,
          consent_id: consent.id,
          consent_type: consent.consent_type,
          consented_at: consent.consented_at,
          ip_address: consent.ip_address,
          user_agent: consent.user_agent,
          is_active: consent.is_active,
          consent_text: consent.consent_text,
          version: consent.version
        }
      });

    } catch (error) {
      logger.error('❌ Get verification consent error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Check consent status for verification type
  checkConsentStatus: async (req, res) => {
    try {
      const { user_id } = req.user;
      const { verification_type } = req.params;

      const requiredTypes = ConsentValidator.getRequiredConsents(verification_type);
      const consentStatus = {};

      for (const type of requiredTypes) {
        const hasConsent = await ConsentRecord.hasValidConsent(user_id, type);
        consentStatus[type] = hasConsent;
        
        if (!hasConsent) {
          consentStatus.missing = consentStatus.missing || [];
          consentStatus.missing.push(type);
        }
      }

      consentStatus.all_required = requiredTypes.every(type => consentStatus[type] === true);

      res.json({
        success: true,
        data: {
          verification_type,
          required_types: requiredTypes,
          consent_status: consentStatus,
          can_proceed: consentStatus.all_required
        }
      });

    } catch (error) {
      logger.error('❌ Check consent status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};

module.exports = verificationController;
