const auditLogger = require('../utils/auditLogger');

/**
 * Audit middleware factory
 * Creates audit middleware for different entity types
 */
const auditMiddleware = {
  /**
   * Auto-audit CRUD operations for any model
   */
  trackChanges: (entityType) => {
    return async (req, res, next) => {
      const originalJson = res.json;
      
      res.json = function(data) {
        // Store response data for audit
        res.locals.responseData = data;
        res.locals.entityType = entityType;
        
        // Auto-audit based on method
        const method = req.method;
        const userId = req.user?.id;
        const tenantId = req.user?.tenant_id || req.body.tenant_id;
        const ipAddress = req.ip;
        
        // Log based on action
        if (data.success && data.data) {
          const entityId = data.data.id || req.params.id;
          
          switch(method) {
            case 'POST':
              auditLogger.log({
                user_id: userId,
                tenant_id: tenantId,
                entity_type: entityType,
                entity_id: entityId,
                action: 'CREATE',
                new_values: data.data,
                ip_address: ipAddress
              });
              break;
              
            case 'PUT':
            case 'PATCH':
              auditLogger.log({
                user_id: userId,
                tenant_id: tenantId,
                entity_type: entityType,
                entity_id: entityId || req.params.id,
                action: 'UPDATE',
                new_values: req.body,
                ip_address: ipAddress
              });
              break;
              
            case 'DELETE':
              auditLogger.log({
                user_id: userId,
                tenant_id: tenantId,
                entity_type: entityType,
                entity_id: req.params.id,
                action: 'DELETE',
                ip_address: ipAddress
              });
              break;
          }
        }
        
        return originalJson.call(this, data);
      };
      
      next();
    };
  },

  /**
   * Manual audit for specific actions
   */
  logAction: (action, entityType) => {
    return async (req, res, next) => {
      req.auditData = {
        action,
        entityType,
        userId: req.user?.id,
        tenantId: req.user?.tenant_id,
        ipAddress: req.ip,
      };
      next();
    };
  }
};

module.exports = auditMiddleware;
