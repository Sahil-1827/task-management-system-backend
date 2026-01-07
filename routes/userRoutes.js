const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getUsers, updateUserProfile } = require('../controllers/userController');

// Protected route
router.use(protect);

// Get all users
router.get('/', getUsers);

// Update profile route
router.put('/profile', updateUserProfile);

module.exports = router;