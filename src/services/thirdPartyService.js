const { makeRequest } = require('../utils/apiClient');
const axios = require('axios');

function normaliseDob(dob) {
  if (!dob) return '1900-01-01';
  if (typeof dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dob)) return dob;
  const d = (dob instanceof Date) ? dob : new Date(dob);
  if (isNaN(d.getTime())) return '1900-01-01';
  const offset = d.getTimezoneOffset() * 60000;
  const local  = new Date(d.getTime() - offset);
  return local.toISOString().slice(0, 10);
}

const IDFY_BASE_URL   = process.env.THIRD_PARTY_BASE_URL || 'https://eve.idfy.com';
const IDFY_ACCOUNT_ID = process.env.THIRD_PARTY_API_SECRET;
const IDFY_API_KEY    = process.env.THIRD_PARTY_API_KEY;

const thirdPartyService = {

  async verifyPAN(data) {
    console.log('[IDfy] CODE VERSION: flat-body-dob-v2');
    const taskId  = `pan_${Date.now()}`;
    const groupId = `bgv_${Date.now()}`;
    const dob     = normaliseDob(data.dob);
    const body = {
      task_id:  taskId,
      group_id: groupId,
      data: { id_number: data.pan_number, full_name: data.full_name || 'NA', dob },
    };
    console.log(`[IDfy] PAN verify  task_id=${taskId}`);
    console.log(`[IDfy] REQUEST BODY  ${JSON.stringify(body, null, 2)}`);
    const response = await makeRequest('POST', '/v3/tasks/sync/verify_with_source/ind_pan', body);
    console.log(`[IDfy] RAW RESPONSE  ${JSON.stringify(response, null, 2)}`);
    thirdPartyService._assertResult(response, 'PAN');
    return response;
  },

  async verifyPAN_async(data) {
    const taskId  = `pan_${Date.now()}`;
    const groupId = `bgv_${Date.now()}`;
    const dob     = normaliseDob(data.dob);
    const body = {
      task_id: taskId, group_id: groupId,
      data: { id_number: data.pan_number.trim().toUpperCase(), full_name: data.full_name || 'NA', dob },
    };
    const createRes = await axios.post(
      `${IDFY_BASE_URL}/v3/tasks/async/verify_with_source/ind_pan`, body,
      { headers: { 'api-key': IDFY_API_KEY, 'account-id': IDFY_ACCOUNT_ID, 'Content-Type': 'application/json' } }
    );
    const requestId = createRes.data.request_id;
    const result    = await thirdPartyService._pollForResult(requestId);
    thirdPartyService._assertResult(result, 'PAN');
    return result;
  },

  async _pollForResult(requestId, maxAttempts = 30, intervalMs = 2000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res   = await axios.get(`${IDFY_BASE_URL}/v3/tasks`,
        { params: { request_id: requestId }, headers: { 'api-key': IDFY_API_KEY, 'account-id': IDFY_ACCOUNT_ID } });
      const tasks = res.data;
      const task  = Array.isArray(tasks) ? tasks.find(t => t.request_id === requestId) : tasks;
      if (!task) { await new Promise(r => setTimeout(r, intervalMs)); continue; }
      if (task.status === 'completed' || task.status === 'failed') return task;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`[IDfy] Polling timed out after ${maxAttempts} attempts`);
  },

  async verifyAadhaar(data) {
    console.warn('[IDfy] Aadhaar verify_with_source not available on this account.');
    throw new Error('IDfy Aadhaar verification not available on this account. Contact eve.support@idfy.com with your account-id to enable it.');
  },

  async verifyGSTIN(data) {
    console.warn('[IDfy] GSTIN verify_with_source not available on this account.');
    throw new Error('IDfy GSTIN verification not available on this account. Contact eve.support@idfy.com with your account-id to enable it.');
  },

  _assertResult(response, label) {
    if (!response) throw new Error(`[IDfy] ${label}: empty response`);
    const taskStatus   = response.status;
    const sourceOutput = response?.result?.source_output;
    if (taskStatus === 'failed' || !sourceOutput)
      throw new Error(`[IDfy] ${label}: task failed or missing source_output  ${JSON.stringify(response)}`);
    const lookupStatus = sourceOutput.status;
    if (lookupStatus === 'source_down')
      throw new Error(`[IDfy] ${label}: source_down — NSDL unavailable, retry later`);
    console.log(`[IDfy] ${label}: taskStatus=${taskStatus}, lookupStatus=${lookupStatus}, request_id=${response.request_id}`);
  },

  async pollResult(requestId, maxAttempts = 10, intervalMs = 2000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await makeRequest('GET', '/v3/tasks', {}, { request_id: requestId });
      const task     = Array.isArray(response) ? response[0] : response;
      const status   = task?.result?.source_output?.status;
      if (status === 'id_found' || status === 'id_not_found') return task;
      if (task?.status === 'failed') throw new Error(`[IDfy] Failed: ${JSON.stringify(task.result)}`);
      if (status === 'source_down') throw new Error('[IDfy] source_down: retry later');
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`[IDfy] Polling timed out after ${maxAttempts} attempts`);
  },
};

module.exports = thirdPartyService;
