const { makeRequest } = require('../utils/apiClient');

// Call third-party PAN verification API
async function verifyPAN(panData) {
    try {
        const response = await makeRequest(
            'POST',
            '/pan/verify', // ⚠️ adjust based on real API
            {
                pan_number: panData.document_number,
                full_name: panData.full_name,
                dob: panData.dob
            }
        );

        return {
            success: true,
            data: response
        };

    } catch (error) {
        return {
            success: false,
            error: error.response?.data || error.message
        };
    }
}

module.exports = {
    verifyPAN
};