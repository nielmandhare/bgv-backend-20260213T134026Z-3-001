/**
 * Consent validation utilities
 */
class ConsentValidator {
  // Terms and conditions text
  static TERMS_TEXT = `
    I agree to the Terms and Conditions of the Background Verification Platform.
    I understand that my personal data will be used for verification purposes only.
    I confirm that all information provided is true and correct.
  `;

  static PRIVACY_TEXT = `
    I consent to the collection and processing of my personal data
    in accordance with the Privacy Policy. I understand that my data
    will be stored securely and will not be shared with third parties
    except for verification purposes.
  `;

  static DATA_PROCESSING_TEXT = `
    I authorize the Background Verification Platform to share my
    information with verification partners (IDfy, Gridlines) for the
    purpose of conducting background checks as requested.
  `;

  // Get consent text by type
  static getConsentText(type, version = '1.0') {
    const texts = {
      'terms': this.TERMS_TEXT,
      'privacy': this.PRIVACY_TEXT,
      'data_processing': this.DATA_PROCESSING_TEXT,
      'third_party_sharing': this.DATA_PROCESSING_TEXT
    };

    return texts[type] || `I consent to ${type} processing.`;
  }

  // Get all required consents for a verification type
  static getRequiredConsents(verificationType) {
    const baseConsents = ['terms', 'privacy'];
    
    const additionalConsents = {
      'aadhaar': ['data_processing'],
      'pan': ['data_processing'],
      'court': ['data_processing', 'third_party_sharing'],
      'education': ['data_processing'],
      'employment': ['data_processing']
    };

    return [
      ...baseConsents,
      ...(additionalConsents[verificationType] || [])
    ];
  }

  // Generate consent checkbox HTML (for frontend)
  static generateConsentHTML(consentType, version = '1.0') {
    const text = this.getConsentText(consentType, version);
    return {
      type: consentType,
      text: text.trim(),
      version: version,
      required: true
    };
  }

  // Validate that all required consents are present
  static validateConsents(providedConsents, requiredTypes) {
    const missing = [];
    const invalid = [];

    for (const type of requiredTypes) {
      const consent = providedConsents.find(c => c.type === type);
      
      if (!consent) {
        missing.push(type);
      } else if (!consent.accepted) {
        invalid.push(type);
      }
    }

    return {
      valid: missing.length === 0 && invalid.length === 0,
      missing,
      invalid
    };
  }

  // Format consent for API response
  static formatConsentResponse(consentRecords) {
    return consentRecords.map(record => ({
      id: record.id,
      type: record.consent_type,
      accepted_at: record.consented_at,
      version: record.version,
      ip_address: record.ip_address,
      is_active: record.is_active
    }));
  }
}

module.exports = ConsentValidator;
