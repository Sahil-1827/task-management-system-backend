const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getUsers, updateUserProfile, createSubUser, updateSubUser, toggleUserStatus } = require('../controllers/userController');

router.use(protect);

router.get('/', getUsers);

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.put('/profile', upload.single('profilePicture'), updateUserProfile);
router.post('/', upload.single('profilePicture'), createSubUser);
router.put('/:id', upload.single('profilePicture'), updateSubUser);
router.patch('/:id/status', toggleUserStatus);

module.exports = router;