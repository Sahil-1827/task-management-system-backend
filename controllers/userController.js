const User = require('../models/User');

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

module.exports = { getUsers };