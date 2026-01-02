const express = require('express');
const router = express.Router();
const {
  getDisputes,
  getDispute,
  createDispute,
  resolveDispute,
} = require('../controllers/disputeController');

// All routes are public - no authentication required
router.route('/')
  .get(getDisputes)
  .post(createDispute);

router.route('/:id')
  .get(getDispute);

router.put('/:id/resolve', resolveDispute);

module.exports = router;

