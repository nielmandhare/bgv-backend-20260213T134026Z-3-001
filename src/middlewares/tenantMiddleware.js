const logger = require('../utils/logger');

const tenantMiddleware = {
  extractTenant: (req, res, next) => {
    try {
      const tenantId = req.user?.tenant_id;
      
      if (!tenantId) {
        logger.warn('⚠️ No tenant found in user object');
        return res.status(403).json({
          success: false,
          error: 'Tenant information missing'
        });
      }

      req.tenantId = tenantId;
      res.locals.tenantId = tenantId;
      
      logger.debug(`🔒 Tenant isolation: ${tenantId}`);
      next();
    } catch (error) {
      logger.error('❌ Tenant middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'Error processing tenant information'
      });
    }
  },

  validateResourceAccess: (resourceType) => {
    return async (req, res, next) => {
      try {
        const resourceId = req.params.id;
        const tenantId = req.tenantId;
        
        if (!resourceId) return next();

        const { db } = require('../utils/db');
        
        let tableName;
        switch (resourceType) {
          case 'user': tableName = 'users'; break;
          case 'verification': tableName = 'verification_requests'; break;
          case 'document': tableName = 'documents'; break;
          case 'report': tableName = 'reports'; break;
          case 'batch': tableName = 'bulk_upload_batches'; break;
          default: return next();
        }

        const result = await db.query(
          `SELECT tenant_id FROM ${tableName} WHERE id = $1`,
          [resourceId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: `${resourceType} not found`
          });
        }

        if (result.rows[0].tenant_id !== tenantId) {
          logger.warn(`🚫 Cross-tenant access attempt: Tenant ${tenantId} tried to access ${resourceType} ${resourceId}`);
          return res.status(403).json({
            success: false,
            error: 'Access denied - resource belongs to another tenant'
          });
        }

        next();
      } catch (error) {
        logger.error('❌ Resource access validation error:', error);
        res.status(500).json({
          success: false,
          error: 'Error validating resource access'
        });
      }
    };
  },

  logAccessAttempt: (req, res, next) => {
    const originalSend = res.json;
    
    res.json = function(data) {
      if (res.statusCode === 403 && data?.error?.includes('another tenant')) {
        logger.warn(`🔐 SECURITY: Cross-tenant access attempt`, {
          tenantId: req.tenantId,
          path: req.originalUrl,
          method: req.method,
          ip: req.ip,
          user: req.user?.user_id
        });
      }
      return originalSend.call(this, data);
    };
    
    next();
  }
};

module.exports = tenantMiddleware;
