const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const jwt = require('jsonwebtoken');


const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;


    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }


    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }


    const user = new User({
      name,
      email,
      password,
      role: role || 'user',
    });

    await user.save();


    const token = generateToken(user);

    res.status(201).json({
      token,
      user: { id: user._id, name, email, role: user.role, profilePicture: user.profilePicture, createdAt: user.createdAt },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: error.message });
  }
};


const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const authHeader = req.headers.authorization;


    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password').populate('teams').populate('managedTeams').populate('managedTasks');
        if (!user) {
          return res.status(401).json({ message: 'User not found' });
        }

        return res.json({
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            teams: user.teams,
            managedTeams: user.managedTeams,
            managedTasks: user.managedTasks,
            profilePicture: user.profilePicture,
            createdAt: user.createdAt
          },
        });
      } catch (error) {

      }
    }


    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }


    const user = await User.findOne({ email }).populate('teams').populate('managedTeams').populate('managedTasks');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }


    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }


    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email,
        role: user.role,
        teams: user.teams,
        managedTeams: user.managedTeams,
        managedTasks: user.managedTasks,
        profilePicture: user.profilePicture,
        createdAt: user.createdAt
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { register, login };