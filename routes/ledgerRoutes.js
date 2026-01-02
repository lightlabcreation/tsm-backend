const express = require('express');
const router = express.Router();
const {
  getLedger,
  getAgentBalance,
  addTopUp,
  transferToAgent,
} = require('../controllers/ledgerController');

// All routes are public - no authentication required
router.route('/')
  .get(getLedger);

router.get('/balance/:agentId?', getAgentBalance);
router.post('/topup', addTopUp);
router.post('/transfer', transferToAgent);

module.exports = router;

