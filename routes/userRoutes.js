const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
// Import the new updateUserProfile function
const { getUsers, updateUserProfile } = require('../controllers/userController');

// Protected route
router.use(protect);

// Get all users
router.get('/', getUsers);

// Add this new route for updating the profile
router.put('/profile', updateUserProfile);

module.exports = router;