const express = require('express');
const router = express.Router();
const {
  getTrips,
  getTrip,
  createTrip,
  updateTrip,
  deleteTrip,
  addPayment,
  updateDeductions,
  closeTrip,
  addAttachment,
  deleteAttachment,
  getCompanyNames,
} = require('../controllers/tripController');
const upload = require('../utils/upload');

// All routes are public - no authentication required
router.route('/')
  .get(getTrips)
  .post(createTrip);

router.get('/companies', getCompanyNames);

router.route('/:id')
  .get(getTrip)
  .put(updateTrip)
  .delete(deleteTrip);

router.post('/:id/payments', addPayment);
router.put('/:id/deductions', updateDeductions);
router.post('/:id/close', closeTrip);
router.post('/:id/attachments', upload.single('file'), addAttachment);
router.delete('/:id/attachments/:attachmentId', deleteAttachment);

module.exports = router;

