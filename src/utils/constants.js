module.exports = {
  VERIFICATION_TYPES: ['pan', 'aadhaar', 'gst', 'court', 'udyam'],
  USER_ROLES: ['admin', 'client_admin', 'client_user', 'internal_ops', 'auditor'],
  REQUEST_STATUS: ['pending', 'in_progress', 'completed', 'failed', 'retry_pending', 'timeout'],
  JWT_EXPIRY: '7d',
  BCRYPT_ROUNDS: 10,
};
