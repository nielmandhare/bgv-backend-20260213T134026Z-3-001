/**
 * IDfy API Response Mappings
 * Maps IDfy's response fields to standardized format
 */

module.exports = {
  // PAN Verification Mapping
  pan: {
    fields: {
      // targetField: sourcePath (in IDfy response)
      pan_number: 'ocr_output.pan_number',
      name: 'ocr_output.name_on_card',
      father_name: 'ocr_output.fathers_name',
      date_of_birth: 'ocr_output.dob',
      date_of_issue: 'ocr_output.date_of_issue',
      pan_type: 'ocr_output.pan_type',
      is_minor: 'ocr_output.minor',
      is_scanned: 'ocr_output.is_scanned',
      aadhaar_linked: 'aadhaar_link_status.linked',
      aadhaar_link_date: 'aadhaar_link_status.link_date'
    },
    required: ['pan_number', 'name'],
    successIndicator: {
      path: 'status',
      value: 'completed'
    },
    transform: (extracted, raw) => {
      // Add derived fields
      return {
        ...extracted,
        full_name: extracted.name,
        age: calculateAge(extracted.date_of_birth),
        verified_at: new Date().toISOString()
      };
    }
  },

  // Aadhaar Verification Mapping
  aadhaar: {
    fields: {
      aadhaar_number: 'ocr_output.aadhaar_number',
      name: 'ocr_output.name',
      gender: 'ocr_output.gender',
      date_of_birth: 'ocr_output.dob',
      address: 'ocr_output.address',
      pin_code: 'ocr_output.pin_code',
      masked_aadhaar: 'ocr_output.masked_aadhaar',
      is_valid: 'validity.valid',
      is_duplicate: 'validity.is_duplicate'
    },
    required: ['aadhaar_number', 'name'],
    successIndicator: {
      path: 'status',
      value: 'completed'
    }
  },

  // GST Verification Mapping
  gst: {
    fields: {
      gst_number: 'data.gstin',
      business_name: 'data.trade_name',
      legal_name: 'data.legal_name',
      business_type: 'data.constitution_name',
      registration_date: 'data.registration_date',
      last_updated: 'data.last_updated',
      status: 'data.status',
      state: 'data.state',
      address: 'data.address',
      is_active: 'data.status',
      taxpayer_type: 'data.taxpayer_type'
    },
    required: ['gst_number', 'business_name'],
    successIndicator: {
      path: 'status',
      value: 'completed'
    },
    transform: (extracted, raw) => {
      // Add GST-specific derived fields
      return {
        ...extracted,
        is_active: extracted.status === 'Active',
        formatted_address: `${extracted.address}, ${extracted.state}`,
        registration_year: extracted.registration_date?.split('-')[0]
      };
    }
  },

  // Bank Account Verification Mapping
  bank: {
    fields: {
      account_number: 'data.account_number',
      ifsc_code: 'data.ifsc',
      account_holder: 'data.account_holder_name',
      bank_name: 'data.bank_name',
      branch: 'data.branch',
      account_type: 'data.account_type',
      is_valid: 'data.is_valid',
      verification_status: 'data.verification_status'
    },
    required: ['account_number', 'ifsc_code', 'account_holder'],
    successIndicator: {
      path: 'data.is_valid',
      value: true
    }
  },

  // Court Record Mapping
  court: {
    fields: {
      case_number: 'data.case_number',
      court_name: 'data.court_name',
      petitioner: 'data.petitioner',
      respondent: 'data.respondent',
      filing_date: 'data.filing_date',
      status: 'data.case_status',
      judge: 'data.judge_name',
      is_active: 'data.is_active'
    },
    required: ['case_number', 'court_name'],
    successIndicator: {
      path: 'status',
      value: 'completed'
    }
  },

  // Education Verification Mapping
  education: {
    fields: {
      institute_name: 'data.institute_name',
      degree: 'data.degree',
      student_name: 'data.student_name',
      enrollment_number: 'data.enrollment_number',
      passing_year: 'data.passing_year',
      percentage: 'data.percentage',
      grade: 'data.grade',
      is_verified: 'data.is_verified',
      verification_date: 'data.verification_date'
    },
    required: ['institute_name', 'student_name', 'enrollment_number'],
    successIndicator: {
      path: 'data.is_verified',
      value: true
    }
  },

  // Employment Verification Mapping
  employment: {
    fields: {
      employer_name: 'data.employer_name',
      employee_name: 'data.employee_name',
      designation: 'data.designation',
      joining_date: 'data.joining_date',
      relieving_date: 'data.relieving_date',
      is_current: 'data.is_current',
      salary: 'data.salary',
      verification_status: 'data.verification_status',
      comments: 'data.comments'
    },
    required: ['employer_name', 'employee_name', 'designation'],
    successIndicator: {
      path: 'data.verification_status',
      value: 'verified'
    }
  }
};

// Helper function for PAN age calculation
function calculateAge(dob) {
  if (!dob) return null;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}
