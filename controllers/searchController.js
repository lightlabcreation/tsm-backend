const Trip = require('../models/Trip');
const Ledger = require('../models/Ledger');

// @desc    Global LR search - search across all trips and ledger entries
// @route   GET /api/search/lr/:lrNumber
// @access  Public (all users can search any LR)
const globalLRSearch = async (req, res) => {
  try {
    console.log('Global LR Search called:', req.params, req.query);
    const { lrNumber } = req.params;
    const { companyName } = req.query; // Optional company name filter

    if (!lrNumber || lrNumber.trim() === '') {
      return res.status(400).json({ message: 'LR number is required' });
    }

    const searchTerm = lrNumber.trim();
    console.log('Searching for LR:', searchTerm);

    // Build query for trips - search by LR number and optionally by company name
    let tripQuery = {
      $or: [
        { lrNumber: { $regex: searchTerm, $options: 'i' } },
        { tripId: { $regex: searchTerm, $options: 'i' } },
      ],
    };

    // Add company name filter if provided
    if (companyName && companyName.trim() !== '') {
      tripQuery.companyName = { $regex: companyName.trim(), $options: 'i' };
    }

    // Search trips globally (no role-based filtering)
    let trips = [];
    try {
      trips = await Trip.find(tripQuery)
        .populate('agent', 'name email phone branch _id')
        .populate('agentId', 'name email phone branch _id')
        .sort({ createdAt: -1 })
        .limit(50);
    } catch (tripError) {
      console.error('Error fetching trips:', tripError);
      trips = [];
    }

    // Build query for ledger entries
    let ledgerQuery = {
      $or: [
        { lrNumber: { $regex: searchTerm, $options: 'i' } },
        { tripId: { $regex: searchTerm, $options: 'i' } },
      ],
    };

    // Search ledger entries globally (no role-based filtering)
    let ledgerEntries = [];
    try {
      ledgerEntries = await Ledger.find(ledgerQuery)
        .populate('agent', 'name email phone branch _id')
        .populate('agentId', 'name email phone branch _id')
        .populate('tripId', 'lrNumber route _id')
        .sort({ createdAt: -1 })
        .limit(50);
    } catch (ledgerError) {
      console.error('Error fetching ledger entries:', ledgerError);
      ledgerEntries = [];
    }

    // Transform trips - handle both populated and non-populated cases
    const transformedTrips = trips.map(trip => {
      const tripObj = trip.toObject ? trip.toObject() : trip;
      return {
        ...tripObj,
        id: tripObj._id?.toString() || tripObj.id?.toString(),
        agentId: tripObj.agent?._id?.toString() || tripObj.agentId?._id?.toString() || tripObj.agentId?.toString() || tripObj.agent?.toString(),
        agent: tripObj.agent?.name || tripObj.agentId?.name || tripObj.agent || 'Unknown',
        agentDetails: tripObj.agent || tripObj.agentId || null,
      };
    });

    // Transform ledger entries - handle both populated and non-populated cases
    const transformedLedger = ledgerEntries.map(entry => {
      const entryObj = entry.toObject ? entry.toObject() : entry;
      return {
        ...entryObj,
        id: entryObj._id?.toString() || entryObj.id?.toString(),
        agentId: entryObj.agent?._id?.toString() || entryObj.agentId?._id?.toString() || entryObj.agentId?.toString() || entryObj.agent?.toString(),
        agent: entryObj.agent?.name || entryObj.agentId?.name || entryObj.agent || 'Unknown',
      };
    });

    res.json({
      trips: transformedTrips,
      ledger: transformedLedger,
      searchTerm,
    });
  } catch (error) {
    console.error('Global LR search error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error during search',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  globalLRSearch,
};

