const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const jwt = require('jsonwebtoken');

// Register a new user
const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    // Create user
    const user = new User({
      name,
      email,
      password,
      role: role || 'user', // Default to 'user' if no role provided
    });

    await user.save();

    // Generate JWT
    const token = generateToken(user);

    res.status(201).json({
      token,
      user: { id: user._id, name, email, role: user.role, createdAt: user.createdAt },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const authHeader = req.headers.authorization;

    // Check if token is provided in Authorization header (Bearer <token>)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password').populate('teams').populate('managedTeams').populate('managedTasks');
        if (!user) {
          return res.status(401).json({ message: 'User not found' });
        }
        // Token is valid, return user data
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
            createdAt: user.createdAt
          },
        });
      } catch (error) {
        // Token invalid or expired, proceed to email/password login
        console.log('Invalid token, proceeding to email/password login:', error.message);
      }
    }

    // Validate email/password input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email }).populate('teams').populate('managedTeams').populate('managedTasks');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate new JWT
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
        createdAt: user.createdAt
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { register, login };