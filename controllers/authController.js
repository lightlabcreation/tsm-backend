const User = require('../models/User');
const generateToken = require('../utils/generateToken');

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if role matches (if role is provided)
    if (role && user.role !== role) {
      return res.status(403).json({ message: `Access denied. This account is for ${user.role} role.` });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated. Please contact administrator.' });
    }

    // Return user data with role clearly indicated
    const userData = {
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role, // Admin, Agent, or Finance
      branch: user.branch,
      profileImage: user.profileImage,
      token: generateToken(user._id),
    };

    res.json(userData);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Public
const getMe = async (req, res) => {
  try {
    const { userId } = req.query; // Frontend se userId query param me aayega

    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role, // Admin, Agent, or Finance
      branch: user.branch,
      profileImage: user.profileImage,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { login, getMe };

