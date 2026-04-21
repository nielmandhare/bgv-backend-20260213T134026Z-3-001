/**
 * reportRoutes.js
 *
 * Route: GET /api/reports/:id
 *
 * Protected by the standard middleware stack (apiKeyAuth + authMiddleware +
 * tenantMiddleware) — the same as all /api/* routes except /api/auth and
 * /api/webhooks.
 *
 * Mount in src/routes/index.js:
 *   const reportRoutes = require('./reportRoutes');
 *   router.use('/reports', reportRoutes);
 *
 * Usage:
 *   GET /api/reports/<verification-uuid>
 *   Headers: x-api-key + Authorization: Bearer <token>
 *   Response: application/pdf stream (auto-downloads as bgv-report-pan-<uuid>.pdf)
 */

const express          = require("express");
const router           = express.Router();
const reportController = require("../controllers/reportController");

// GET /api/reports/:id — stream PDF report for a single verification
router.get("/:id", reportController.generateReport);

module.exports = router;