const Tenant = require('./Tenant');
const User = require('./User');
const VerificationRequest = require('./VerificationRequest');
const Report = require('./Report');
const AuditLog = require('./AuditLog');
const ConsentRecord = require('./ConsentRecord');  // ← ADD THIS

module.exports = {
  Tenant,
  User,
  VerificationRequest,
  Report,
  AuditLog,
  ConsentRecord,  // ← ADD THIS
};
