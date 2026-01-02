const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  path: String,
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
});

const onTripPaymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  mode: {
    type: String,
    enum: ['Cash', 'Online'],
    default: 'Cash',
  },
  bank: String,
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  addedByRole: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const tripSchema = new mongoose.Schema({
  lrNumber: {
    type: String,
    required: true,
  },
  tripId: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  truckNumber: {
    type: String,
    required: true,
  },
  driverPhoneNumber: {
    type: String,
    required: true,
  },
  companyName: {
    type: String,
    required: true,
  },
  routeFrom: {
    type: String,
    required: true,
  },
  routeTo: {
    type: String,
    required: true,
  },
  route: {
    type: String,
    required: true,
  },
  tonnage: {
    type: Number,
    default: 0,
  },
  lrSheet: {
    type: String,
    default: 'Not Received',
  },
  isBulk: {
    type: Boolean,
    default: false,
  },
  type: {
    type: String,
    enum: ['Normal', 'Bulk'],
    default: 'Normal',
  },
  freight: {
    type: Number,
    default: 0,
  },
  freightAmount: {
    type: Number,
    default: 0,
  },
  advance: {
    type: Number,
    default: 0,
  },
  advancePaid: {
    type: Number,
    default: 0,
  },
  balance: {
    type: Number,
    default: 0,
  },
  balanceAmount: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['Active', 'Completed', 'In Dispute', 'Dispute', 'Pending', 'Cancelled'],
    default: 'Active',
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  branch: {
    type: String,
    default: null,
  },
  onTripPayments: [onTripPaymentSchema],
  deductions: {
    cess: { type: Number, default: 0 },
    kata: { type: Number, default: 0 },
    excessTonnage: { type: Number, default: 0 },
    halting: { type: Number, default: 0 },
    expenses: { type: Number, default: 0 },
    beta: { type: Number, default: 0 },
    others: { type: Number, default: 0 },
    othersReason: { type: String, default: '' },
  },
  attachments: [attachmentSchema],
  finalBalance: {
    type: Number,
    default: 0,
  },
  closedAt: {
    type: Date,
  },
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Indexes for better query performance
tripSchema.index({ agent: 1 });
tripSchema.index({ branch: 1 });
tripSchema.index({ status: 1 });
tripSchema.index({ lrNumber: 1 });
tripSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Trip', tripSchema);

