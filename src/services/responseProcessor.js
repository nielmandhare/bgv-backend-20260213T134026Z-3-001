const idfyMapping = require('./vendorMappings/idfyMapping');
const gridlinesMapping = require('./vendorMappings/gridlinesMapping');
const confidenceCalculator = require('../utils/confidenceCalculator');
const logger = require('../utils/logger');

class ResponseProcessor {
  constructor() {
    // Register all vendor mappings
    this.vendors = {
      'idfy': idfyMapping,
      'gridlines': gridlinesMapping
    };
  }

  /**
   * Process vendor response into standardized format
   * @param {string} vendor - Vendor name ('idfy', 'gridlines')
   * @param {object} rawResponse - Raw response from vendor
   * @param {string} verificationType - Type of verification ('pan', 'aadhaar', etc.)
   * @returns {object} Standardized response
   */
  process(vendor, rawResponse, verificationType) {
    try {
      logger.info(`🔄 Processing ${vendor} response for ${verificationType}`);

      // Get the appropriate vendor mapping
      const mapping = this.vendors[vendor.toLowerCase()];
      if (!mapping) {
        throw new Error(`Unknown vendor: ${vendor}`);
      }

      // Get the specific mapping for this verification type
      const typeMapping = mapping[verificationType];
      if (!typeMapping) {
        throw new Error(`No mapping found for ${verificationType} with vendor ${vendor}`);
      }

      // Extract data using the mapping
      const extracted = this.extractData(rawResponse, typeMapping);
      
      // Calculate confidence score
      const confidence = confidenceCalculator.calculate(
        extracted,
        rawResponse,
        verificationType
      );

      // Determine if verification was successful
      const verified = this.isVerified(extracted, typeMapping, rawResponse);

      // Build standardized response
      const standardized = {
        request_id: rawResponse.request_id || rawResponse.id || 'unknown',
        vendor,
        verification_type: verificationType,
        status: this.mapStatus(rawResponse.status, verified),
        verified,
        confidence_score: confidence,
        result: extracted,
        raw_response: rawResponse, // Keep for audit
        processed_at: new Date().toISOString(),
        metadata: {
          vendor_version: rawResponse.version || '1.0',
          processing_time_ms: rawResponse.processing_time || 0
        }
      };

      logger.info(`✅ Processed ${vendor} response with confidence ${confidence}`);
      return standardized;

    } catch (error) {
      logger.error(`❌ Response processing failed:`, error);
      
      // Return error response
      return {
        request_id: rawResponse?.request_id || 'unknown',
        vendor,
        verification_type: verificationType,
        status: 'failed',
        verified: false,
        confidence_score: 0,
        error: error.message,
        raw_response: rawResponse,
        processed_at: new Date().toISOString()
      };
    }
  }

  /**
   * Extract data using field mappings
   */
  extractData(rawResponse, mapping) {
    const extracted = {};

    for (const [targetField, sourcePath] of Object.entries(mapping.fields)) {
      try {
        // Handle nested paths like 'ocr_output.pan_number'
        const value = this.getValueByPath(rawResponse, sourcePath);
        if (value !== undefined) {
          extracted[targetField] = value;
        }
      } catch (error) {
        logger.debug(`Field extraction failed for ${targetField}:`, error.message);
      }
    }

    // Apply any transformations if needed
    if (mapping.transform) {
      return mapping.transform(extracted, rawResponse);
    }

    return extracted;
  }

  /**
   * Get value from nested object using dot notation
   */
  getValueByPath(obj, path) {
    if (!obj || !path) return undefined;
    
    const keys = path.split('.');
    let value = obj;
    
    for (const key of keys) {
      if (value === null || value === undefined) return undefined;
      value = value[key];
    }
    
    return value;
  }

  /**
   * Map vendor status to standardized status
   */
  mapStatus(vendorStatus, verified) {
    const statusMap = {
      'completed': verified ? 'completed' : 'failed',
      'success': verified ? 'completed' : 'failed',
      'failed': 'failed',
      'error': 'failed',
      'timeout': 'timeout',
      'pending': 'in_progress'
    };

    return statusMap[vendorStatus?.toLowerCase()] || 
           (verified ? 'completed' : 'failed');
  }

  /**
   * Determine if verification was successful
   */
  isVerified(extracted, mapping, rawResponse) {
    // Check if we have all required fields
    const requiredFields = mapping.required || [];
    const hasAllRequired = requiredFields.every(field => 
      extracted[field] !== undefined && extracted[field] !== null
    );

    if (!hasAllRequired) return false;

    // Check vendor-specific success indicators
    if (mapping.successIndicator) {
      const indicator = this.getValueByPath(rawResponse, mapping.successIndicator.path);
      return indicator === mapping.successIndicator.value;
    }

    // Default: if we have required fields and no error, assume success
    return rawResponse.error === undefined && 
           rawResponse.status !== 'failed' &&
           rawResponse.status !== 'error';
  }
}

module.exports = new ResponseProcessor();
