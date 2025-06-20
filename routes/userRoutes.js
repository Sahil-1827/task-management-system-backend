const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getUsers } = require('../controllers/userController');

// Protected route
router.use(protect);

// Get all users
router.get('/', getUsers);

module.exports = router;