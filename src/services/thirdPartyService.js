const { makeRequest } = require('../utils/apiClient');

const thirdPartyService = {

  verifyPAN(data) {
    return makeRequest('POST', '/pan/verify', data);
  },

  verifyAadhaar(data) {
    return makeRequest('POST', '/aadhaar/verify', data);
  },

  verifyGSTIN(data) {
    return makeRequest('POST', '/gstin/verify', data);
  },

};

module.exports = thirdPartyService;