const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

// Get all users (filtered by role, excluding the requesting user)
const getUsers = async (req, res) => {
  try {
    let users;
    if (req.user.role === 'admin') {
      users = await User.find({ _id: { $ne: req.user._id } }).select('name email role createdAt');
    } else if (req.user.role === 'manager') {
      users = await User.find({ _id: { $ne: req.user._id } }).select('name email role createdAt');
    } else {
      users = [];
    }
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add this new function to update the user profile
const updateUserProfile = async (req, res) => {
  try {
    // Find the user by the ID from the authenticated token
    const user = await User.findById(req.user._id);

    if (user) {
      // Update user fields with data from the request body
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;

      // Save the updated user to the database
      const updatedUser = await user.save();

      // Log user profile update
      await ActivityLog.create({
        action: 'update',
        entity: 'user',
        entityId: updatedUser._id,
        performedBy: req.user._id,
        details: `User profile for "${updatedUser.name}" was updated by ${req.user.name}`
      });

      // Return the updated user data
      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        createdAt: updatedUser.createdAt
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Update profile error:', error);
    // Handle potential error if the new email is already taken
    if (error.code === 11000) {
        return res.status(400).json({ message: 'Email already in use' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};


// Export the new function along with the existing one
module.exports = { getUsers, updateUserProfile };