const express = require('express');
const router = express.Router();
const { login, getMe } = require('../controllers/authController');

router.post('/login', login);
router.get('/me', getMe);

module.exports = router;

