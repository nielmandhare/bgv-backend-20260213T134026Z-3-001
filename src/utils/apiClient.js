const axios = require('axios');

/**
 * IDfy Eve v3 REST API client.
 *
 * Base URL : https://eve.idfy.com
 * Auth headers:
 *   api-key    → THIRD_PARTY_API_KEY    (e.g. "0a9caefa-...")
 *   account-id → THIRD_PARTY_API_SECRET (e.g. "2e6c9dadb1d1/...")
 *
 * Note: the env file is .env.development — make sure dotenv loads it.
 * In server.js / app.js you likely have:
 *   require('dotenv').config({ path: '.env.development' });
 */
const apiClient = axios.create({
  baseURL: process.env.THIRD_PARTY_BASE_URL || 'https://eve.idfy.com',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'api-key': process.env.THIRD_PARTY_API_KEY,
    'account-id': process.env.THIRD_PARTY_API_SECRET,
  },
});

apiClient.interceptors.request.use((config) => {
  console.log(`[IDfy REQUEST] ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);
  return config;
});

apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('[IDfy ERROR]', error.response?.status, error.response?.data || error.message);
    throw error;
  }
);

/**
 * @param {'GET'|'POST'} method
 * @param {string}       url     - path, e.g. '/v3/tasks/sync/verify_with_source/ind_pan'
 * @param {object}       data    - request body (POST)
 * @param {object}       params  - query params (GET)
 */
const makeRequest = async (method, url, data = {}, params = {}) => {
  return apiClient({ method, url, data, params });
};

module.exports = { makeRequest };