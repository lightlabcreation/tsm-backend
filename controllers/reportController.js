const Trip = require('../models/Trip');
const Ledger = require('../models/Ledger');
const Dispute = require('../models/Dispute');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

// @desc    Get dashboard stats
// @route   GET /api/reports/dashboard
// @access  Public
const getDashboardStats = async (req, res) => {
  try {
    const { agentId, branchId, startDate, endDate } = req.query; // Filters
    let tripQuery = {};
    let ledgerQuery = {};
    let auditQuery = {};

    console.log('Dashboard Stats Request:', { agentId, branchId, startDate, endDate });

    // Date Range Filter
    if (startDate || endDate) {
      tripQuery.date = {};
      ledgerQuery.date = {};
      auditQuery.createdAt = {}; // Audit logs use createdAt

      if (startDate) {
        tripQuery.date.$gte = new Date(startDate);
        ledgerQuery.date.$gte = new Date(startDate);
        auditQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        // Include full end date
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);

        tripQuery.date.$lte = endDateTime;
        ledgerQuery.date.$lte = endDateTime;
        auditQuery.createdAt.$lte = endDateTime;
      }
    }

    // Role/Branch Filters
    if (agentId) {
      tripQuery.agent = agentId;
      ledgerQuery.agent = agentId;
    }
    if (branchId) {
      tripQuery.branch = branchId;
    }

    // 1. Trip Stats
    const activeTrips = await Trip.countDocuments({ ...tripQuery, status: 'Active' });
    const completedTrips = await Trip.countDocuments({ ...tripQuery, status: 'Completed' });
    const tripsInDispute = await Trip.countDocuments({
      ...tripQuery,
      status: { $in: ['In Dispute', 'Dispute'] }
    });
    const lrNotReceived = await Trip.countDocuments({
      ...tripQuery,
      $or: [
        { lrSheet: { $exists: false } },
        { lrSheet: null },
        { lrSheet: 'Not Received' },
        { lrSheet: '' }
      ]
    });
    const regularTrips = await Trip.countDocuments({ ...tripQuery, isBulk: { $ne: true } });
    const bulkTrips = await Trip.countDocuments({ ...tripQuery, isBulk: true });

    // 2. Unique Counts
    const uniqueAgents = (await Trip.distinct('agent', tripQuery)).length;
    const uniqueTrucks = (await Trip.distinct('truckNumber', tripQuery)).length;

    let totalAgentsCount = uniqueAgents;
    if (!startDate && !endDate && !agentId) {
      totalAgentsCount = await User.countDocuments({ role: 'Agent' });
      console.log('Counting ALL agents from User model:', totalAgentsCount);
    }

    // 3. Audit Events
    let totalAuditLogs = 0;
    try {
      if (AuditLog) {
        totalAuditLogs = await AuditLog.countDocuments(auditQuery);
        console.log('AuditLog count success:', totalAuditLogs);
      } else {
        console.error('AuditLog model is undefined');
      }
    } catch (e) {
      console.error('Error counting audit logs:', e);
    }

    // 4. Dispute Stats
    let disputeQuery = {};
    if (startDate || endDate) {
      disputeQuery.createdAt = {};
      if (startDate) disputeQuery.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        disputeQuery.createdAt.$lte = endDateTime;
      }
    }
    if (agentId) {
      disputeQuery.agent = agentId;
    }

    const openDisputes = await Dispute.countDocuments({ ...disputeQuery, status: 'Open' });
    const resolvedDisputes = await Dispute.countDocuments({ ...disputeQuery, status: 'Resolved' });

    const response = {
      activeTrips,
      completedTrips,
      tripsInDispute,
      lrNotReceived,
      regularTrips,
      bulkTrips,
      totalAgents: totalAgentsCount,
      totalTrucks: uniqueTrucks,
      totalAuditLogs,
      disputeStats: {
        total: openDisputes + resolvedDisputes,
        open: openDisputes,
        resolved: resolvedDisputes
      }
    };

    // 5. Finance Metrics (Mid-Payments & Top-Ups)
    let financeDateQuery = {};
    if (startDate || endDate) {
      financeDateQuery = { ...ledgerQuery };
    } else {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      financeDateQuery.date = {
        $gte: todayStart,
        $lte: todayEnd
      };
    }

    // Mid-Payments
    const midPaymentsAgg = await Ledger.aggregate([
      {
        $match: {
          ...financeDateQuery,
          type: 'On-Trip Payment',
          paymentMadeBy: 'Finance'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    response.midPaymentsToday = midPaymentsAgg.length > 0 ? midPaymentsAgg[0].total : 0;

    // Top-Ups
    const topUpsAgg = await Ledger.aggregate([
      {
        $match: {
          ...financeDateQuery,
          type: { $in: ['Top-up', 'Virtual Top-up'] }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    response.topUpsToday = topUpsAgg.length > 0 ? topUpsAgg[0].total : 0;

    console.log('Dashboard stats calculated:', JSON.stringify(response, null, 2));
    res.json(response);

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get trip report
// @route   GET /api/reports/trips
// @access  Public
const getTripReport = async (req, res) => {
  try {
    const { startDate, endDate, agentId, branch, status } = req.query;
    let query = {};

    // No role-based filtering - use query params
    if (agentId) {
      query.agent = agentId;
    }
    if (branch) {
      query.branch = branch;
    }
    if (status) {
      query.status = status;
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const trips = await Trip.find(query)
      .populate('agent', 'name email phone branch _id')
      .populate('agentId', 'name email phone branch _id')
      .sort({ createdAt: -1 });

    // Transform trips
    const transformedTrips = trips.map(trip => ({
      ...trip.toObject(),
      id: trip._id,
      agentId: trip.agent?._id || trip.agentId?._id || trip.agentId,
      agent: trip.agent?.name || trip.agentId?.name || trip.agent,
    }));

    res.json(transformedTrips);
  } catch (error) {
    console.error('Get trip report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get ledger report
// @route   GET /api/reports/ledger
// @access  Public
const getLedgerReport = async (req, res) => {
  try {
    const { startDate, endDate, agentId, bank } = req.query;
    let query = {};

    // No role-based filtering - use query params
    if (agentId) {
      query.agent = agentId;
    }
    if (bank) {
      query.bank = bank;
    }
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }

    const ledger = await Ledger.find(query)
      .populate('agent', 'name email phone branch _id')
      .populate('agentId', 'name email phone branch _id')
      .populate('tripId', 'lrNumber route _id')
      .sort({ date: -1 });

    // Transform ledger
    const transformedLedger = ledger.map(entry => ({
      ...entry.toObject(),
      id: entry._id,
      agentId: entry.agent?._id || entry.agentId?._id || entry.agentId,
      agent: entry.agent?.name || entry.agentId?.name || entry.agent,
    }));

    res.json(transformedLedger);
  } catch (error) {
    console.error('Get ledger report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get agent performance report
// @route   GET /api/reports/agents
// @access  Public
const getAgentPerformanceReport = async (req, res) => {
  try {
    const agents = await User.find({ role: 'Agent' });
    const performance = [];

    for (const agent of agents) {
      const trips = await Trip.find({ agent: agent._id });
      const ledger = await Ledger.find({ agent: agent._id });

      const balance = ledger.reduce((sum, entry) => {
        if (entry.direction === 'Credit') {
          return sum + (entry.amount || 0);
        } else {
          return sum - (entry.amount || 0);
        }
      }, 0);

      performance.push({
        agent: {
          _id: agent._id,
          id: agent._id,
          name: agent.name,
          email: agent.email,
          phone: agent.phone,
          branch: agent.branch,
        },
        stats: {
          totalTrips: trips.length,
          activeTrips: trips.filter(t => t.status === 'Active').length,
          completedTrips: trips.filter(t => t.status === 'Completed').length,
          disputedTrips: trips.filter(t => t.status === 'In Dispute').length,
          totalFreight: trips.reduce((sum, t) => sum + (t.freight || 0), 0),
          currentBalance: balance,
        },
      });
    }

    res.json(performance);
  } catch (error) {
    console.error('Get agent performance report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getDashboardStats,
  getTripReport,
  getLedgerReport,
  getAgentPerformanceReport,
};

