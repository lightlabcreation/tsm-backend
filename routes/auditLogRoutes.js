const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditLogController');

// All routes are public - no authentication required
router.get('/', getAuditLogs);

module.exports = router;

