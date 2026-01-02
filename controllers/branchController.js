const Branch = require('../models/Branch');
const User = require('../models/User');
const { createAuditLog } = require('../middleware/auditLog');

// @desc    Get all branches
// @route   GET /api/branches
// @access  Public
const getBranches = async (req, res) => {
  try {
    const branches = await Branch.find().sort({ name: 1 });
    // Return branches with IDs (frontend needs IDs for select options)
    res.json(branches.map(b => ({
      id: b._id,
      _id: b._id,
      name: b.name,
    })));
  } catch (error) {
    console.error('Get branches error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create branch
// @route   POST /api/branches
// @access  Public
const createBranch = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Branch name cannot be empty' });
    }

    const branchName = name.trim().toUpperCase();

    // Check if branch already exists
    const branchExists = await Branch.findOne({ name: branchName });
    if (branchExists) {
      return res.status(400).json({ message: 'Branch already exists' });
    }

    const branch = await Branch.create({ name: branchName });

    // Create audit log
    const userId = req.body.userId || null;
    const userRole = req.body.userRole || 'Admin';
    await createAuditLog(
      userId,
      userRole,
      'Create Branch',
      'Branch',
      branch._id,
      {
        name: branch.name,
      },
      req.ip
    );

    res.status(201).json({
      id: branch._id,
      _id: branch._id,
      name: branch.name,
    });
  } catch (error) {
    console.error('Create branch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update branch
// @route   PUT /api/branches/:id
// @access  Private/Admin
const updateBranch = async (req, res) => {
  try {
    const { name } = req.body;
    const branchId = req.params.id;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Branch name cannot be empty' });
    }

    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' });
    }

    const newBranchName = name.trim().toUpperCase();

    // Check if new name already exists
    const branchExists = await Branch.findOne({ name: newBranchName, _id: { $ne: branchId } });
    if (branchExists) {
      return res.status(400).json({ message: 'Branch name already exists' });
    }

    const oldName = branch.name;
    branch.name = newBranchName;
    await branch.save();

    // Update all users with this branch
    await User.updateMany(
      { branch: oldName },
      { $set: { branch: newBranchName } }
    );

    // Create audit log
    const userId = req.body.userId || null;
    const userRole = req.body.userRole || 'Admin';
    await createAuditLog(
      userId,
      userRole,
      'Update Branch',
      'Branch',
      branch._id,
      {
        oldName: oldName,
        newName: newBranchName,
      },
      req.ip
    );

    res.json({
      id: branch._id,
      _id: branch._id,
      name: branch.name,
    });
  } catch (error) {
    console.error('Update branch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete branch
// @route   DELETE /api/branches/:id
// @access  Private/Admin
const deleteBranch = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' });
    }

    // Check if any users are assigned to this branch
    const usersWithBranch = await User.countDocuments({ branch: branch.name });
    if (usersWithBranch > 0) {
      return res.status(400).json({ 
        message: `Cannot delete branch. ${usersWithBranch} user(s) are assigned to this branch.` 
      });
    }

    // Create audit log before deleting
    const userId = req.body.userId || null;
    const userRole = req.body.userRole || 'Admin';
    await createAuditLog(
      userId,
      userRole,
      'Delete Branch',
      'Branch',
      branch._id,
      {
        name: branch.name,
      },
      req.ip
    );

    await Branch.findByIdAndDelete(req.params.id);

    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    console.error('Delete branch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
};

