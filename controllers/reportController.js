const Trip = require('../models/Trip');
const Ledger = require('../models/Ledger');
const Dispute = require('../models/Dispute');
const User = require('../models/User');

// @desc    Get dashboard stats
// @route   GET /api/reports/dashboard
// @access  Public
const getDashboardStats = async (req, res) => {
  try {
    const { agentId, branchId } = req.query; // Optional filters
    let tripQuery = {};
    let ledgerQuery = {};
    let disputeQuery = {};

    // No role-based filtering - use query params if provided
    if (agentId) {
      tripQuery.agent = agentId;
      ledgerQuery.agent = agentId;
      disputeQuery.agent = agentId;
    }
    if (branchId) {
      tripQuery.branch = branchId;
    }

    // Trip stats
    const activeTrips = await Trip.countDocuments({ ...tripQuery, status: 'Active' });
    const completedTrips = await Trip.countDocuments({ ...tripQuery, status: 'Completed' });
    const disputedTrips = await Trip.countDocuments({ 
      ...tripQuery, 
      status: { $in: ['In Dispute', 'Dispute'] } 
    });
    const totalTrips = await Trip.countDocuments(tripQuery);

    // Ledger stats - Get today's entries (check both createdAt and date fields)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Query today's ledger entries - use createdAt as primary, date as fallback
    const todayLedger = await Ledger.find({
      ...ledgerQuery,
      $or: [
        { createdAt: { $gte: today, $lt: tomorrow } },
        { date: { $gte: today, $lt: tomorrow } }
      ]
    }).lean(); // Use lean() for better performance
    
    console.log('Today ledger entries count:', todayLedger.length)
    console.log('Today date range:', today, 'to', tomorrow)
    
    // Also get Finance payments directly for debugging
    const allFinancePayments = await Ledger.find({
      ...ledgerQuery,
      type: 'On-Trip Payment',
      paymentMadeBy: 'Finance'
    }).lean();
    console.log('All Finance payments (any date):', allFinancePayments.length, allFinancePayments.map(p => ({ amount: p.amount, date: p.date, createdAt: p.createdAt, lrNumber: p.lrNumber })))

    // Calculate daily top-ups from today's ledger entries
    const dailyTopUps = todayLedger
      .filter(l => l.type === 'Top-up' || l.type === 'Virtual Top-up')
      .reduce((sum, l) => sum + (l.amount || 0), 0);
    
    console.log('Daily top-ups today:', dailyTopUps, 'from', todayLedger.filter(l => l.type === 'Top-up' || l.type === 'Virtual Top-up').length, 'entries')

    // Finance mid-payments: On-Trip Payments made by Finance today
    // SIMPLIFIED APPROACH: Query all Finance payments and filter by date in code
    const allFinancePaymentsQuery = await Ledger.find({
      type: 'On-Trip Payment',
      paymentMadeBy: 'Finance'
    }).lean();
    
    console.log('=== FINANCE PAYMENTS DEBUG ===')
    console.log('All Finance payments found:', allFinancePaymentsQuery.length)
    console.log('Today date range:', today.toISOString(), 'to', tomorrow.toISOString())
    
    allFinancePaymentsQuery.forEach(p => {
      const pDate = p.date ? new Date(p.date) : new Date(p.createdAt)
      const isToday = pDate >= today && pDate < tomorrow
      console.log(`Finance payment: Amount=${p.amount}, LR=${p.lrNumber}, Date=${pDate.toISOString()}, IsToday=${isToday}, paymentMadeBy=${p.paymentMadeBy}`)
    })
    
    // Filter by today's date
    const financePaymentsToday = allFinancePaymentsQuery.filter(p => {
      const pDate = p.date ? new Date(p.date) : new Date(p.createdAt)
      return pDate >= today && pDate < tomorrow
    })
    
    console.log('Finance payments today (filtered):', financePaymentsToday.length, financePaymentsToday.map(p => ({ amount: p.amount, lrNumber: p.lrNumber })))
    
    // Calculate total
    const financeMidPayments = financePaymentsToday.reduce((sum, l) => sum + (l.amount || 0), 0);
    
    console.log('Finance mid-payments today (final):', financeMidPayments)
    console.log('=== END FINANCE PAYMENTS DEBUG ===')

    // All daily payments (for backward compatibility)
    const dailyPayments = todayLedger
      .filter(l => l.type === 'On-Trip Payment')
      .reduce((sum, l) => sum + l.amount, 0);

    // Bank-wise spend (always included)
    const bankWiseSpend = {};
    const allLedger = await Ledger.find({ direction: 'Debit' });
    allLedger.forEach(entry => {
      const bank = entry.bank || 'Cash';
      bankWiseSpend[bank] = (bankWiseSpend[bank] || 0) + entry.amount;
    });

    // Dispute stats
    const openDisputes = await Dispute.countDocuments({ ...disputeQuery, status: 'Open' });
    const resolvedDisputes = await Dispute.countDocuments({ ...disputeQuery, status: 'Resolved' });

    // Additional trip stats
    const lrSheetsNotReceived = await Trip.countDocuments({ 
      ...tripQuery, 
      $or: [
        { lrSheet: { $exists: false } },
        { lrSheet: null },
        { lrSheet: 'Not Received' },
        { lrSheet: '' }
      ]
    });
    const normalTrips = await Trip.countDocuments({ ...tripQuery, isBulk: false });
    const bulkTrips = await Trip.countDocuments({ ...tripQuery, isBulk: true });

    // Bank-wise movements today
    const bankSummary = {};
    todayLedger.forEach(entry => {
      const bank = entry.bank || 'Cash';
      if (!bankSummary[bank]) {
        bankSummary[bank] = { credit: 0, debit: 0, net: 0 };
      }
      if (entry.direction === 'Credit') {
        bankSummary[bank].credit += (entry.amount || 0);
        bankSummary[bank].net += (entry.amount || 0);
      } else {
        bankSummary[bank].debit += (entry.amount || 0);
        bankSummary[bank].net -= (entry.amount || 0);
      }
    });
    const bankMovementsToday = Object.keys(bankSummary).length;
    const totalBankNet = Object.values(bankSummary).reduce((sum, b) => sum + b.net, 0);

    const response = {
      trips: {
        active: activeTrips,
        completed: completedTrips,
        disputed: disputedTrips,
        total: totalTrips,
      },
      ledger: {
        dailyTopUps,
        dailyPayments,
        bankWiseSpend,
      },
      disputes: {
        open: openDisputes,
        resolved: resolvedDisputes,
      },
      // Finance dashboard specific stats
      midPaymentsToday: financeMidPayments,
      topUpsToday: dailyTopUps,
      activeTrips: activeTrips,
      lrSheetsNotReceived: lrSheetsNotReceived,
      normalTrips: normalTrips,
      bulkTrips: bulkTrips,
      bankMovementsToday: bankMovementsToday,
      totalBankNet: totalBankNet,
      bankSummary: bankSummary,
      trips: {
        total: totalTrips,
        active: activeTrips,
        completed: completedTrips,
        disputed: disputedTrips,
      },
    };
    
    console.log('=== DASHBOARD STATS RESPONSE ===')
    console.log('midPaymentsToday:', financeMidPayments)
    console.log('topUpsToday:', dailyTopUps)
    console.log('activeTrips:', activeTrips)
    console.log('normalTrips:', normalTrips)
    console.log('bulkTrips:', bulkTrips)
    console.log('Full response:', JSON.stringify(response, null, 2))
    console.log('=== END DASHBOARD STATS ===')
    
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

