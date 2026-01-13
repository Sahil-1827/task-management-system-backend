const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getUsers, updateUserProfile } = require('../controllers/userController');


router.use(protect);


router.get('/', getUsers);



const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.put('/profile', upload.single('profilePicture'), updateUserProfile);

module.exports = router;