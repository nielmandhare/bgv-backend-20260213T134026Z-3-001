const axios = require('axios');

const apiClient = axios.create({
  baseURL: process.env.THIRD_PARTY_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.THIRD_PARTY_API_KEY,
    'x-api-secret': process.env.THIRD_PARTY_API_SECRET,
  },
});

// Request interceptor
apiClient.interceptors.request.use((config) => {
  console.log(`[API REQUEST] ${config.method.toUpperCase()} ${config.url}`);
  return config;
});

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('[API ERROR]', error.response?.data || error.message);
    throw error;
  }
);

// Generic reusable request function
const makeRequest = async (method, url, data = {}, params = {}) => {
  return apiClient({
    method,
    url,
    data,
    params,
  });
};

module.exports = { makeRequest };