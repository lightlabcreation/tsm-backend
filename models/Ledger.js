const mongoose = require('mongoose');

const ledgerSchema = new mongoose.Schema({
  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    default: null,
  },
  lrNumber: {
    type: String,
    default: null,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  description: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: [
      'Trip Created',
      'Top-up',
      'Virtual Top-up',
      'Virtual Expense',
      'On-Trip Payment',
      'Agent Transfer',
      'Settlement',
      'Trip Closed',
      'Beta/Batta Credit',
    ],
  },
  amount: {
    type: Number,
    required: true,
    default: 0,
  },
  advance: {
    type: Number,
    default: 0,
  },
  balance: {
    type: Number,
    default: 0,
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
  bank: {
    type: String,
    default: 'HDFC Bank',
  },
  direction: {
    type: String,
    required: true,
    enum: ['Credit', 'Debit'],
  },
  // paymentMadeBy field - commented out temporarily to avoid enum validation errors
  // Will be added back after server restart with proper configuration
  // paymentMadeBy: {
  //   type: mongoose.Schema.Types.Mixed,
  //   required: false,
  // },
}, {
  timestamps: true,
  strict: false, // Allow fields not in schema to be saved
});

// Indexes for better query performance
ledgerSchema.index({ agent: 1 });
ledgerSchema.index({ tripId: 1 });
ledgerSchema.index({ date: -1 });
ledgerSchema.index({ createdAt: -1 });
ledgerSchema.index({ lrNumber: 1 });

// Note: paymentMadeBy field removed from schema to avoid enum validation errors
// It can still be saved to documents due to strict: false option
// Pre-save and pre-validate hooks removed as field is not in schema

// Delete existing model if it exists to avoid schema caching issues
if (mongoose.models.Ledger) {
  delete mongoose.models.Ledger;
}
if (mongoose.modelSchemas && mongoose.modelSchemas.Ledger) {
  delete mongoose.modelSchemas.Ledger;
}

module.exports = mongoose.model('Ledger', ledgerSchema);

