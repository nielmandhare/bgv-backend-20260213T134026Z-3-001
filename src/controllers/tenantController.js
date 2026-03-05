const { Tenant } = require('../models');
const logger = require('../utils/logger');

const tenantController = {
  getAllTenants: async (req, res) => {
    try {
      const tenants = await Tenant.findAll();
      res.json({ success: true, data: tenants });
    } catch (error) {
      logger.error('Get tenants error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getTenantById: async (req, res) => {
    try {
      const tenant = await Tenant.findById(req.params.id);
      if (!tenant) {
        return res.status(404).json({ success: false, error: 'Tenant not found' });
      }
      res.json({ success: true, data: tenant });
    } catch (error) {
      logger.error('Get tenant error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  createTenant: async (req, res) => {
    try {
      const tenant = await Tenant.create(req.body);
      res.status(201).json({ success: true, data: tenant });
    } catch (error) {
      logger.error('Create tenant error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
};

module.exports = tenantController;
