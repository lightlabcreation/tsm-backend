const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema({
  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    required: true,
  },
  lrNumber: {
    type: String,
    required: true,
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
  type: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['Open', 'Resolved'],
    default: 'Open',
  },
  reason: {
    type: String,
    required: true,
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  resolvedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Indexes
disputeSchema.index({ tripId: 1 });
disputeSchema.index({ agent: 1 });
disputeSchema.index({ status: 1 });
disputeSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Dispute', disputeSchema);

