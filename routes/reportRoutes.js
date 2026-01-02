const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getTripReport,
  getLedgerReport,
  getAgentPerformanceReport,
} = require('../controllers/reportController');

// All routes are public - no authentication required
router.get('/dashboard', getDashboardStats);
router.get('/trips', getTripReport);
router.get('/ledger', getLedgerReport);
router.get('/agents', getAgentPerformanceReport);

module.exports = router;

