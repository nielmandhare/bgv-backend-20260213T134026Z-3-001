/**
 * Gridlines API Response Mappings
 * Maps Gridlines response fields to standardized format
 */

module.exports = {
  // PAN Verification Mapping for Gridlines
  pan: {
    fields: {
      pan_number: 'result.pan',
      name: 'result.name',
      father_name: 'result.father_name',
      date_of_birth: 'result.dob',
      pan_status: 'result.status',
      is_valid: 'result.is_valid',
      aadhaar_seeded: 'result.aadhaar_seeded'
    },
    required: ['pan_number', 'name'],
    successIndicator: {
      path: 'result.is_valid',
      value: true
    }
  },

  // Aadhaar Verification Mapping for Gridlines
  aadhaar: {
    fields: {
      aadhaar_number: 'result.aadhaar_number',
      name: 'result.name',
      gender: 'result.gender',
      date_of_birth: 'result.dob',
      address: 'result.address',
      pin_code: 'result.pincode',
      is_valid: 'result.is_valid',
      age_band: 'result.age_band',
      state: 'result.state'
    },
    required: ['aadhaar_number', 'name'],
    successIndicator: {
      path: 'result.is_valid',
      value: true
    }
  },

  // GST Verification Mapping for Gridlines
  gst: {
    fields: {
      gst_number: 'result.gstin',
      business_name: 'result.trade_name',
      legal_name: 'result.legal_name',
      registration_date: 'result.registration_date',
      status: 'result.status',
      state: 'result.state',
      address: 'result.address',
      business_type: 'result.business_type'
    },
    required: ['gst_number', 'business_name'],
    successIndicator: {
      path: 'result.status',
      value: 'Active'
    }
  },

  // UDYAM Verification Mapping
  udyam: {
    fields: {
      udyam_number: 'result.udyam_number',
      enterprise_name: 'result.enterprise_name',
      owner_name: 'result.owner_name',
      registration_date: 'result.registration_date',
      classification: 'result.classification',
      activity: 'result.activity',
      address: 'result.address',
      is_active: 'result.is_active'
    },
    required: ['udyam_number', 'enterprise_name'],
    successIndicator: {
      path: 'result.is_active',
      value: true
    }
  }
};
