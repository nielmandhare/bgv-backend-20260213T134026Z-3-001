const ConsentRecord = require('../models/ConsentRecord');

/**
 * Middleware to validate consent before processing request
 */
const consentMiddleware = {
  // Check if user has accepted required terms
  validateConsent: (requiredTypes = ['terms', 'privacy']) => {
    return async (req, res, next) => {
      try {
        const { user_id, tenant_id } = req.user;
        const { consent } = req.body;

        // If consent flags are provided in request body
        if (consent) {
          // Check each required consent type
          const missingConsent = requiredTypes.filter(
            type => !consent[type] || consent[type] !== true
          );

          if (missingConsent.length > 0) {
            return res.status(400).json({
              success: false,
              error: 'Consent required',
              missing: missingConsent,
              message: `You must accept: ${missingConsent.join(', ')}`
            });
          }

          // Store consent data for later saving
          req.consentData = {
            user_id,
            tenant_id,
            consent_types: requiredTypes,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
          };

          return next();
        }

        // Alternative: Check if user already has valid consent in database
        for (const type of requiredTypes) {
          const hasConsent = await ConsentRecord.hasValidConsent(user_id, type);
          
          if (!hasConsent) {
            return res.status(400).json({
              success: false,
              error: 'Consent required',
              missing: [type],
              message: `You must accept ${type} terms. Please visit /consent page.`
            });
          }
        }

        next();

      } catch (error) {
        console.error('❌ Consent validation error:', error);
        res.status(500).json({
          success: false,
          error: 'Error validating consent'
        });
      }
    };
  },

  // Save consent records after successful request
  saveConsent: (consentType, consentText, version = '1.0') => {
    return async (req, res, next) => {
      // Store original send function
      const originalSend = res.json;
      
      // Override res.json to capture response
      res.json = async function(data) {
        if (data.success && req.consentData) {
          try {
            // Save consent record
            await ConsentRecord.create({
              user_id: req.consentData.user_id,
              tenant_id: req.consentData.tenant_id,
              verification_request_id: data.data?.id || req.body.verification_request_id,
              consent_type: consentType,
              consent_text: consentText,
              version: version,
              ip_address: req.consentData.ip_address,
              user_agent: req.consentData.user_agent,
              metadata: {
                endpoint: req.originalUrl,
                method: req.method
              }
            });
            
            console.log(`✅ Consent recorded: ${consentType} for user ${req.consentData.user_id}`);
          } catch (error) {
            console.error('❌ Failed to save consent:', error);
          }
        }
        
        // Call original send
        return originalSend.call(this, data);
      };
      
      next();
    };
  },

  // Simple middleware to capture consent from request body
  captureConsent: (req, res, next) => {
    const { consent_accepted, consent_type = 'terms' } = req.body;
    
    if (!consent_accepted) {
      return res.status(400).json({
        success: false,
        error: 'Consent not accepted',
        message: 'You must accept the terms to proceed'
      });
    }

    req.consentData = {
      user_id: req.user?.user_id,
      tenant_id: req.user?.tenant_id,
      consent_types: [consent_type],
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    };

    next();
  }
};

module.exports = consentMiddleware;
