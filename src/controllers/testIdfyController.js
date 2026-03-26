const idfyService = require('../services/idfyService');
const logger = require('../utils/logger');

const testIdfyController = {
  testPAN: async (req, res) => {
    try {
      let { pan_number, name, dob } = req.body;
      
      if (!pan_number) {
        return res.status(400).json({
          success: false,
          error: 'pan_number is required'
        });
      }

      // Clean the PAN (remove spaces, uppercase)
      pan_number = pan_number.trim().toUpperCase().replace(/\s/g, '');
      
      logger.info(`📝 Testing PAN verification: ${pan_number}`);
      
      const result = await idfyService.verifyPAN(pan_number, name, dob);
      
      res.json({
        success: result.success,
        data: result,
        message: result.success ? 'PAN verified successfully' : 'PAN verification failed'
      });

    } catch (error) {
      logger.error('❌ Test PAN error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  testAadhaar: async (req, res) => {
    try {
      let { aadhaar_number, name } = req.body;
      
      if (!aadhaar_number) {
        return res.status(400).json({
          success: false,
          error: 'aadhaar_number is required'
        });
      }

      // Clean Aadhaar (remove spaces)
      aadhaar_number = aadhaar_number.trim().replace(/\s/g, '');
      
      logger.info(`📝 Testing Aadhaar verification: ${aadhaar_number}`);
      
      const result = await idfyService.verifyAadhaar(aadhaar_number, name);
      
      res.json({
        success: result.success,
        data: result,
        message: result.success ? 'Aadhaar verified successfully' : 'Aadhaar verification failed'
      });

    } catch (error) {
      logger.error('❌ Test Aadhaar error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  testConnection: async (req, res) => {
    try {
      const result = await idfyService.testConnection();
      
      res.json({
        success: result.success,
        message: result.message,
        data: result
      });

    } catch (error) {
      logger.error('❌ Test connection error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};

module.exports = testIdfyController;
