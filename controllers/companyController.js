const Company = require('../models/Company');

// @desc    Get all companies (sorted)
// @route   GET /api/companies
// @access  Public (UI controls admin usage)
const getCompanies = async (req, res) => {
  try {
    const { search } = req.query || {};
    const filter = {};

    if (search && search.trim()) {
      filter.name = { $regex: search.trim(), $options: 'i' };
    }

    const companies = await Company.find(filter).collation({ locale: 'en', strength: 2 }).sort({ name: 1 });
    res.json(companies);
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single company
// @route   GET /api/companies/:id
// @access  Public (UI controls admin usage)
const getCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }
    res.json(company);
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create a company
// @route   POST /api/companies
// @access  Public (UI controls admin usage)
const createCompany = async (req, res) => {
  try {
    const { name, createdBy = null } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Company name is required' });
    }

    const trimmed = name.trim();

    // Check if exists (case-insensitive)
    const existing = await Company.findOne({ name: trimmed }).collation({ locale: 'en', strength: 2 });
    if (existing) {
      return res.status(400).json({ message: 'Company already exists' });
    }

    const company = await Company.create({ name: trimmed, createdBy });
    res.status(201).json(company);
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update a company
// @route   PUT /api/companies/:id
// @access  Public (UI controls admin usage)
const updateCompany = async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Company name is required' });
    }
    const trimmed = name.trim();

    // Check duplicate on a different id (case-insensitive)
    const duplicate = await Company.findOne({ name: trimmed }).collation({ locale: 'en', strength: 2 });
    if (duplicate && String(duplicate._id) !== String(req.params.id)) {
      return res.status(400).json({ message: 'Company already exists' });
    }

    const updated = await Company.findByIdAndUpdate(
      req.params.id,
      { name: trimmed },
      { new: true, runValidators: true }
    ).collation({ locale: 'en', strength: 2 });

    if (!updated) {
      return res.status(404).json({ message: 'Company not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete a company
// @route   DELETE /api/companies/:id
// @access  Public (UI controls admin usage)
const deleteCompany = async (req, res) => {
  try {
    const deleted = await Company.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Company not found' });
    }
    res.json({ message: 'Company deleted', id: deleted._id });
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
};

