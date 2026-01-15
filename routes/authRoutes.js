const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../controllers/authControllers');

router.post('/register', register);
router.post('/login', login);

const { protect } = require('../middleware/authMiddleware');
router.get('/me', protect, getMe);

module.exports = router;