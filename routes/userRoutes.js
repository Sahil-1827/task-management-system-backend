const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getUsers, updateUserProfile } = require('../controllers/userController');


router.use(protect);


router.get('/', getUsers);


router.put('/profile', updateUserProfile);

module.exports = router;