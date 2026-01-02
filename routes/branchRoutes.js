const express = require('express');
const router = express.Router();
const {
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
} = require('../controllers/branchController');

// All routes are public - no authentication required
router.route('/')
  .get(getBranches)
  .post(createBranch);

router.route('/:id')
  .put(updateBranch)
  .delete(deleteBranch);

module.exports = router;

