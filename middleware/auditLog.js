const AuditLog = require('../models/AuditLog');

const createAuditLog = async (userId, userRole, action, entityType, entityId, changes = {}, ipAddress = null) => {
  try {
    await AuditLog.create({
      action,
      entityType,
      entityId,
      userId: userId || null,
      userRole: userRole || 'System',
      changes,
      ipAddress: ipAddress || null,
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
    // Don't throw error, just log it
  }
};

module.exports = { createAuditLog };

