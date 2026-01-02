const express = require('express');
const router = express.Router();
const { globalLRSearch } = require('../controllers/searchController');

// Test route to verify search routes are working
router.get('/test', (req, res) => {
  res.json({ message: 'Search routes are working', status: 'OK' });
});

// Global LR search route - accessible to all users
router.get('/lr/:lrNumber', globalLRSearch);

module.exports = router;

