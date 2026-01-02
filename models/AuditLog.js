const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
  },
  entityType: {
    type: String,
    required: true,
    enum: ['Trip', 'User', 'Ledger', 'Dispute', 'Branch'],
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  userRole: {
    type: String,
    required: true,
  },
  changes: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  ipAddress: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

// Indexes
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ entityType: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

