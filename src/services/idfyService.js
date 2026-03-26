const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class IDFYService {
  constructor() {
    this.accountId = process.env.IDFY_ACCOUNT_ID;
    this.apiKey = process.env.IDFY_API_KEY;
    this.baseUrl = process.env.IDFY_BASE_URL || 'https://eve.idfy.com/v3';
  }

  cleanPAN(pan) {
    return pan.trim().toUpperCase().replace(/\s/g, '');
  }

  async verifyPAN(panNumber, name = null, dob = null) {
    try {
      const cleanPan = this.cleanPAN(panNumber);
      logger.info('Verifying PAN: ' + cleanPan);

      const taskId = uuidv4();
      const groupId = uuidv4();

      const data = {
        id_number: cleanPan,
        full_name: name || 'NA',
        dob: dob || '1900-01-01'
      };

      const payload = { task_id: taskId, group_id: groupId, data };
      logger.debug('Payload: ' + JSON.stringify(payload));

      const createRes = await axios.post(
        this.baseUrl + '/tasks/async/verify_with_source/ind_pan',
        payload,
        {
          headers: {
            'account-id': this.accountId,
            'api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      const requestId = createRes.data.request_id;
      logger.info('Task created: ' + requestId);

      const result = await this.pollForResult(requestId);
      const src = (result && result.result && result.result.source_output) || {};

      return {
        success:        result.status === 'completed',
        verified:       src.status === 'id_found',
        pan:            cleanPan,
        pan_status:     src.pan_status || null,
        aadhaar_linked: src.aadhaar_seeding_status || false,
        name_match:     src.name_match || false,
        dob_match:      src.dob_match  || false,
        request_id:     requestId,
        raw:            result
      };

    } catch (error) {
      logger.error('PAN verification error: ' + (error.response ? JSON.stringify(error.response.data) : error.message));
      return {
        success:  false,
        verified: false,
        error:    error.response ? error.response.data : error.message,
        pan:      panNumber
      };
    }
  }

  async pollForResult(requestId, maxAttempts, intervalMs) {
    if (!maxAttempts) maxAttempts = 30;
    if (!intervalMs)  intervalMs  = 2000;

    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      var res = await axios.get(
        this.baseUrl + '/tasks?request_id=' + requestId,
        {
          headers: {
            'account-id': this.accountId,
            'api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      var tasks = res.data;
      var task  = Array.isArray(tasks)
        ? tasks.find(function(t) { return t.request_id === requestId; })
        : tasks;

      if (!task) {
        await new Promise(function(r) { setTimeout(r, intervalMs); });
        continue;
      }

      logger.debug('Poll ' + attempt + ': status = ' + task.status);

      if (task.status === 'completed') {
        logger.info('Task completed: ' + JSON.stringify(task));
        return task;
      }

      if (task.status === 'failed') {
        logger.warn('Task failed: ' + JSON.stringify(task));
        return task;
      }

      await new Promise(function(r) { setTimeout(r, intervalMs); });
    }

    throw new Error('Timeout: IDfy did not respond in time');
  }

  async testConnection() {
    return this.verifyPAN('ABCDE1234F');
  }
}

module.exports = new IDFYService();