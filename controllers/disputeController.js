const Dispute = require('../models/Dispute');
const Trip = require('../models/Trip');
const { createAuditLog } = require('../middleware/auditLog');

// @desc    Get all disputes
// @route   GET /api/disputes
// @access  Public
const getDisputes = async (req, res) => {
  try {
    const { agentId, status } = req.query;
    let query = {};

    // No role-based filtering - all disputes visible to all
    if (agentId) {
      query.agent = agentId;
    }

    if (status) {
      query.status = status;
    }

    const disputes = await Dispute.find(query)
      .populate('agent', 'name email phone branch _id')
      .populate('agentId', 'name email phone branch _id')
      .populate('tripId', 'lrNumber route status _id')
      .populate('resolvedBy', 'name role _id')
      .sort({ createdAt: -1 });

    // Transform disputes to match frontend expectations
    const transformedDisputes = disputes.map(dispute => ({
      ...dispute.toObject(),
      id: dispute._id,
      agentId: dispute.agent?._id || dispute.agentId?._id || dispute.agentId,
      agent: dispute.agent?.name || dispute.agentId?.name || dispute.agent,
      tripId: dispute.tripId?._id || dispute.tripId,
    }));

    res.json(transformedDisputes);
  } catch (error) {
    console.error('Get disputes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single dispute
// @route   GET /api/disputes/:id
// @access  Public
const getDispute = async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id)
      .populate('agent', 'name email phone branch _id')
      .populate('agentId', 'name email phone branch _id')
      .populate('tripId', 'lrNumber route status _id')
      .populate('resolvedBy', 'name role _id');

    if (!dispute) {
      return res.status(404).json({ message: 'Dispute not found' });
    }

    // No access check - public access
    const transformedDispute = {
      ...dispute.toObject(),
      id: dispute._id,
      agentId: dispute.agent?._id || dispute.agentId?._id || dispute.agentId,
      agent: dispute.agent?.name || dispute.agentId?.name || dispute.agent,
      tripId: dispute.tripId?._id || dispute.tripId,
    };

    res.json(transformedDispute);
  } catch (error) {
    console.error('Get dispute error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create dispute
// @route   POST /api/disputes
// @access  Public
const createDispute = async (req, res) => {
  try {
    const { tripId, type, reason, amount, agentId } = req.body; // Frontend se agentId aayega

    if (!agentId) {
      return res.status(400).json({ message: 'agentId is required' });
    }

    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Verify agentId matches trip's agent
    if (trip.agent.toString() !== agentId.toString()) {
      return res.status(400).json({ message: 'Agent ID does not match trip agent' });
    }

    // Only allow disputes for Active trips
    if (trip.status !== 'Active') {
      return res.status(400).json({ message: 'Disputes can only be raised for Active trips' });
    }

    // Check if dispute already exists
    const existingDispute = await Dispute.findOne({ tripId, status: 'Open' });
    if (existingDispute) {
      return res.status(400).json({ message: 'An open dispute already exists for this trip' });
    }

    const dispute = await Dispute.create({
      tripId,
      lrNumber: trip.lrNumber,
      agent: agentId,
      agentId: agentId,
      type,
      reason,
      amount: parseFloat(amount) || 0,
      status: 'Open',
    });

    // Update trip status to "In Dispute"
    trip.status = 'In Dispute';
    await trip.save();

    // Populate dispute with error handling
    let populatedDispute;
    try {
      populatedDispute = await Dispute.findById(dispute._id)
        .populate('agent', 'name email phone branch _id')
        .populate('agentId', 'name email phone branch _id')
        .populate('tripId', 'lrNumber route status _id');
    } catch (populateError) {
      console.error('Populate error (non-critical):', populateError);
      populatedDispute = dispute;
    }

    // Transform dispute
    let transformedDispute;
    try {
      transformedDispute = {
        ...(populatedDispute.toObject ? populatedDispute.toObject() : populatedDispute),
        id: dispute._id,
        agentId: dispute.agent?._id || dispute.agentId?._id || dispute.agentId,
        agent: dispute.agent?.name || dispute.agentId?.name || dispute.agent,
        tripId: dispute.tripId?._id || dispute.tripId,
      };
    } catch (transformError) {
      console.error('Transform error (non-critical):', transformError);
      transformedDispute = {
        ...dispute.toObject(),
        id: dispute._id,
        agentId: agentId,
        agent: 'Unknown',
        tripId: tripId,
      };
    }

    // Create audit log (don't fail if this fails)
    try {
      await createAuditLog(
        agentId,
        'Agent',
        'Create Dispute',
        'Dispute',
        dispute._id,
        {
          lrNumber: trip.lrNumber,
          type,
          amount: parseFloat(amount) || 0,
          tripId: trip._id,
        },
        req.ip
      );
    } catch (auditError) {
      console.error('Audit log error (non-critical):', auditError);
    }

    res.status(201).json(transformedDispute);
  } catch (error) {
    console.error('Create dispute error:', error);
    console.error('Error stack:', error.stack);
    // If dispute was created but response failed, still return success
    try {
      const existingDispute = await Dispute.findOne({ tripId: req.body.tripId, status: 'Open' });
      if (existingDispute) {
        const basicDispute = {
          ...existingDispute.toObject(),
          id: existingDispute._id,
          agentId: req.body.agentId,
          agent: 'Unknown',
          tripId: req.body.tripId,
        };
        return res.status(201).json(basicDispute);
      }
    } catch (checkError) {
      console.error('Error checking existing dispute:', checkError);
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Resolve dispute
// @route   PUT /api/disputes/:id/resolve
// @access  Public
const resolveDispute = async (req, res) => {
  try {
    const { resolvedBy } = req.body; // Frontend se resolvedBy (admin ID) aayega

    const dispute = await Dispute.findById(req.params.id);

    if (!dispute) {
      return res.status(404).json({ message: 'Dispute not found' });
    }

    if (dispute.status === 'Resolved') {
      return res.status(400).json({ message: 'Dispute is already resolved' });
    }

    dispute.status = 'Resolved';
    dispute.resolvedBy = resolvedBy || null; // Use resolvedBy from body
    dispute.resolvedAt = new Date();
    await dispute.save();

    // Restore trip status to Active
    const trip = await Trip.findById(dispute.tripId);
    if (trip) {
      trip.status = 'Active';
      await trip.save();
    }

    const populatedDispute = await Dispute.findById(dispute._id)
      .populate('agent', 'name email phone branch _id')
      .populate('agentId', 'name email phone branch _id')
      .populate('tripId', 'lrNumber route status _id')
      .populate('resolvedBy', 'name role _id');

    // Create audit log
    await createAuditLog(
      resolvedBy || null,
      'Admin',
      'Resolve Dispute',
      'Dispute',
      dispute._id,
      {
        lrNumber: dispute.lrNumber,
        disputeId: dispute._id,
        tripId: dispute.tripId,
      },
      req.ip
    );

    res.json(populatedDispute);
  } catch (error) {
    console.error('Resolve dispute error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getDisputes,
  getDispute,
  createDispute,
  resolveDispute,
};

