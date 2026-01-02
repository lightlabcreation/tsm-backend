const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

// @desc    Get all audit logs
// @route   GET /api/audit-logs
// @access  Public
const getAuditLogs = async (req, res) => {
  try {
    const { date, type, userId, page = 1, limit = 100 } = req.query;
    let query = {};

    // Filter by date
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    // Filter by type (action)
    if (type) {
      query.action = type;
    }

    // Filter by user
    if (userId) {
      query.userId = userId;
    }

    const auditLogs = await AuditLog.find(query)
      .populate('userId', 'name email role _id')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await AuditLog.countDocuments(query);

    // Transform to match frontend expectations
    const transformedLogs = auditLogs.map(log => ({
      id: log._id,
      _id: log._id,
      timestamp: log.createdAt,
      type: log.action,
      description: `${log.action} - ${log.entityType} ${log.entityId}`,
      user: log.userId?.name || 'System',
      userId: log.userId?._id || log.userId,
      userRole: log.userRole,
      entityType: log.entityType,
      entityId: log.entityId,
      changes: log.changes,
      details: {
        ...log.changes,
        entityType: log.entityType,
        entityId: log.entityId,
      },
      createdAt: log.createdAt,
    }));

    res.json({
      logs: transformedLogs,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAuditLogs,
};

