const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenantController');
const authMiddleware = require('../middlewares/authmiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');


router.get('/', authMiddleware, tenantController.getAllTenants);
router.get('/:id', authMiddleware, tenantController.getTenantById);
router.post('/', authMiddleware, tenantController.createTenant);
router.get(
  '/',
  authMiddleware,
  roleMiddleware(['admin', 'client']),
  tenantController.getAllTenants
);

router.post(
  '/',
  authMiddleware,
  roleMiddleware(['admin']), // only admin can create
  tenantController.createTenant
);


module.exports = router;
