const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');


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
    res.status(500).json({ message: error.message });
  }
};


const updateUserProfile = async (req, res) => {
  try {

    const user = await User.findById(req.user._id);

    if (user) {

      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;


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