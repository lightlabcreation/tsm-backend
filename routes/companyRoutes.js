const express = require('express');
const router = express.Router();

const {
  getCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
} = require('../controllers/companyController');

console.log('Company controller loaded successfully');

// All routes are public - UI will restrict to admins
router.route('/')
  .get(getCompanies)
  .post(createCompany);

router.route('/:id')
  .get(getCompany)
  .put(updateCompany)
  .delete(deleteCompany);

console.log('Company routes defined: GET/POST /api/companies, GET/PUT/DELETE /api/companies/:id');

module.exports = router;

