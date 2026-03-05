const { AuditLog } = require('../models');

/**
 * Audit Logger - For DPDP compliance
 * Logs all sensitive actions for audit trail
 */
const auditLogger = {
  /**
   * Log user action
   */
  log: async (data) => {
    try {
      // Never log sensitive data
      const cleanData = {
        tenant_id: data.tenant_id || null,
        user_id: data.user_id || null,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        action: data.action,
        old_values: data.old_values || null,
        new_values: data.new_values || null,
        ip_address: data.ip_address || req?.ip || null,
      };

      await AuditLog.create(cleanData);
    } catch (error) {
      console.error('Audit log failed:', error.message);
      // Don't throw - audit logging should not break the app
    }
  },

  /**
   * Log user login
   */
  login: async (userId, tenantId, ipAddress) => {
    return auditLogger.log({
      user_id: userId,
      tenant_id: tenantId,
      entity_type: 'user',
      entity_id: userId,
      action: 'LOGIN',
      ip_address: ipAddress,
    });
  },

  /**
   * Log user logout
   */
  logout: async (userId, tenantId, ipAddress) => {
    return auditLogger.log({
      user_id: userId,
      tenant_id: tenantId,
      entity_type: 'user',
      entity_id: userId,
      action: 'LOGOUT',
      ip_address: ipAddress,
    });
  },

  /**
   * Log verification request creation
   */
  verificationCreated: async (verificationId, userId, tenantId, ipAddress) => {
    return auditLogger.log({
      user_id: userId,
      tenant_id: tenantId,
      entity_type: 'verification_request',
      entity_id: verificationId,
      action: 'CREATE',
      ip_address: ipAddress,
    });
  },

  /**
   * Log verification status change
   */
  verificationStatusChanged: async (verificationId, userId, tenantId, oldStatus, newStatus, ipAddress) => {
    return auditLogger.log({
      user_id: userId,
      tenant_id: tenantId,
      entity_type: 'verification_request',
      entity_id: verificationId,
      action: 'STATUS_CHANGE',
      old_values: { status: oldStatus },
      new_values: { status: newStatus },
      ip_address: ipAddress,
    });
  },

  /**
   * Log report generation
   */
  reportGenerated: async (reportId, verificationId, userId, tenantId, ipAddress) => {
    return auditLogger.log({
      user_id: userId,
      tenant_id: tenantId,
      entity_type: 'report',
      entity_id: reportId,
      action: 'GENERATE',
      new_values: { verification_request_id: verificationId },
      ip_address: ipAddress,
    });
  },

  /**
   * Log document upload
   */
  documentUploaded: async (documentId, userId, tenantId, documentType, ipAddress) => {
    return auditLogger.log({
      user_id: userId,
      tenant_id: tenantId,
      entity_type: 'document',
      entity_id: documentId,
      action: 'UPLOAD',
      new_values: { document_type: documentType },
      ip_address: ipAddress,
    });
  },

  /**
   * Log consent record
   */
  consentRecorded: async (consentId, userId, tenantId, subjectName, consentType, ipAddress) => {
    return auditLogger.log({
      user_id: userId,
      tenant_id: tenantId,
      entity_type: 'consent',
      entity_id: consentId,
      action: 'CONSENT_GIVEN',
      new_values: { subject_name: subjectName, consent_type: consentType },
      ip_address: ipAddress,
    });
  },

  /**
   * Log data export (GDPR/DPDP right to access)
   */
  dataExported: async (userId, tenantId, subjectId, ipAddress) => {
    return auditLogger.log({
      user_id: userId,
      tenant_id: tenantId,
      entity_type: 'user_data',
      entity_id: subjectId,
      action: 'EXPORT',
      ip_address: ipAddress,
    });
  },

  /**
   * Log manual override (admin action)
   */
  manualOverride: async (adminId, tenantId, entityType, entityId, reason, changes, ipAddress) => {
    return auditLogger.log({
      user_id: adminId,
      tenant_id: tenantId,
      entity_type: entityType,
      entity_id: entityId,
      action: 'MANUAL_OVERRIDE',
      old_values: changes.old,
      new_values: { ...changes.new, reason },
      ip_address: ipAddress,
    });
  },
};

module.exports = auditLogger;
