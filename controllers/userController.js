const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');


const getUsers = async (req, res) => {
  try {
    let users;
    if (req.user.role === 'admin') {
      users = await User.find({ _id: { $ne: req.user._id } }).select('name email role createdAt profilePicture');
    } else if (req.user.role === 'manager') {
      users = await User.find({ _id: { $ne: req.user._id } }).select('name email role createdAt profilePicture');
    } else {
      users = [];
    }
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: error.message });
  }
};


const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;

      if (req.file) {
        const { cloudinary } = require('../utils/cloudinary');

        // Upload to Cloudinary using buffer
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'user_profiles',
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          uploadStream.end(req.file.buffer);
        });

        user.profilePicture = result.secure_url;
      }

      const updatedUser = await user.save();

      await ActivityLog.create({
        action: 'update',
        entity: 'user',
        entityId: updatedUser._id,
        performedBy: req.user._id,
        details: `User profile for "${updatedUser.name}" was updated by ${req.user.name}`
      });

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        profilePicture: updatedUser.profilePicture,
        createdAt: updatedUser.createdAt
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Update profile error:', error);

    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already in use' });
    }
    res.status(500).json({ message: error.message });
  }
};


module.exports = { getUsers, updateUserProfile };