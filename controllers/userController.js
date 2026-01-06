const User = require('../models/User');
const { createAuditLog } = require('../middleware/auditLog');

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  try {
    const { role } = req.query;
    let query = {};

    // Filter by role if provided
    if (role) {
      query.role = role;
    }

    const users = await User.find(query).select('-password').sort({ createdAt: -1 });

    // Transform to match frontend expectations (with id field)
    const transformedUsers = users.map(user => ({
      ...user.toObject(),
      id: user._id,
    }));

    res.json(transformedUsers);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all agents (for dropdowns/filters)
// @route   GET /api/users/agents
// @access  Public
const getAgents = async (req, res) => {
  try {
    const { branchId } = req.query; // Optional branch filter

    let query = { role: 'Agent', isActive: true };

    // Filter by branch if provided
    if (branchId) {
      query.branch = branchId;
    }

    const agents = await User.find(query)
      .select('name email phone branch _id')
      .sort({ name: 1 });

    // Transform to match frontend expectations (AgentFilter component)
    const transformedAgents = agents.map(agent => ({
      id: agent._id,
      _id: agent._id,
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      branch: agent.branch,
    }));

    res.json(transformedAgents);
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private/Admin
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      branch: user.branch,
      profileImage: user.profileImage
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create user
// @route   POST /api/users
// @access  Public
const createUser = async (req, res) => {
  try {
    const { name, email, password, phone, role, branchId } = req.body; // Frontend se branchId aayega (not branch name)

    // Check if user already exists
    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Validate branchId for Agent role
    if (role === 'Agent' && !branchId) {
      return res.status(400).json({ message: 'branchId is required for Agent role' });
    }

    // Get branch name from branchId if provided
    let branchName = null;
    if (branchId && role === 'Agent') {
      const Branch = require('../models/Branch');
      const branch = await Branch.findById(branchId);
      if (!branch) {
        return res.status(404).json({ message: 'Branch not found' });
      }
      branchName = branch.name;
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      phone,
      role,
      branch: role === 'Agent' ? branchName : null,
    });

    // Create audit log (don't fail if this fails)
    try {
      const userId = req.body.userId || null;
      const userRole = req.body.userRole || 'Admin';
      await createAuditLog(
        userId,
        userRole,
        'Create User',
        'User',
        user._id,
        {
          name: user.name,
          email: user.email,
          role: user.role,
          branch: user.branch,
        },
        req.ip
      );
    } catch (auditError) {
      console.error('Audit log error (non-critical):', auditError);
    }

    res.status(201).json({
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      branch: user.branch,
      profileImage: user.profileImage,
    });
  } catch (error) {
    console.error('Create user error:', error);
    console.error('Error stack:', error.stack);
    // If user was created but response failed, still return success
    try {
      const existingUser = await User.findOne({ email: req.body.email?.toLowerCase() });
      if (existingUser) {
        return res.status(201).json({
          _id: existingUser._id,
          id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          phone: existingUser.phone,
          role: existingUser.role,
          branch: existingUser.branch,
        });
      }
    } catch (checkError) {
      console.error('Error checking existing user:', checkError);
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Public
const updateUser = async (req, res) => {
  try {
    const { name, email, password, phone, role, branchId } = req.body; // Frontend se branchId aayega
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if email is being changed and if it's already taken
    if (email && email.toLowerCase() !== user.email) {
      const emailExists = await User.findOne({ email: email.toLowerCase() });
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    user.name = name || user.name;
    user.email = email ? email.toLowerCase() : user.email;
    user.phone = phone || user.phone;
    user.role = role || user.role;

    // Update branch based on role and branchId
    if (role === 'Agent' && branchId) {
      const Branch = require('../models/Branch');
      const branch = await Branch.findById(branchId);
      if (!branch) {
        return res.status(404).json({ message: 'Branch not found' });
      }
      user.branch = branch.name;
    } else if (role !== 'Agent') {
      user.branch = null;
    }

    // Update password if provided
    if (password) {
      user.password = password;
    }

    // Update profileImage if uploaded
    if (req.file) {
      // Store relative path 'uploads/filename' instead of absolute path
      // This ensures it works with the static file serving in server.js
      user.profileImage = 'uploads/' + req.file.filename;
    }

    const updatedUser = await user.save();

    // Create audit log - wrap in try/catch to prevent failure if audit log fails
    try {
      const userId = req.body.userId || updatedUser._id;
      const userRole = req.body.userRole || user.role;

      await createAuditLog(
        userId,
        userRole,
        'Update User',
        'User',
        updatedUser._id,
        {
          changes: req.body,
          previousEmail: user.email,
          imageUpdated: !!req.file
        },
        req.ip
      );
    } catch (auditError) {
      console.error('Audit log creation failed:', auditError);
      // Continue execution - don't fail the request just because audit log failed
    }

    res.json({
      _id: updatedUser._id,
      id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      branch: updatedUser.branch,
      profileImage: updatedUser.profileImage,
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Public
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create audit log before deleting
    // Try to get userId and userRole from body (for DELETE requests, body might be empty)
    // Also check query params as fallback
    const userId = req.body?.userId || req.query?.userId || null;
    const userRole = req.body?.userRole || req.query?.userRole || 'Admin';

    await createAuditLog(
      userId,
      userRole,
      'Delete User',
      'User',
      user._id,
      {
        name: user.name,
        email: user.email,
        role: user.role,
      },
      req.ip
    );

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getAgents,
};

