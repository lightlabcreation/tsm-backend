const Trip = require('../models/Trip');
const Ledger = require('../models/Ledger');
const Dispute = require('../models/Dispute');
const User = require('../models/User');
const Company = require('../models/Company');
const { createAuditLog } = require('../middleware/auditLog');

// Helper function to transform trip for frontend
const transformTrip = (trip) => {
  if (!trip) return null;
  const tripObj = trip.toObject ? trip.toObject() : trip;

  // Transform attachments.uploadedBy from object to string
  const transformedAttachments = tripObj.attachments?.map(att => ({
    ...att,
    uploadedBy: att.uploadedBy?.name || att.uploadedBy || 'Unknown',
  })) || tripObj.attachments;

  // Transform onTripPayments.addedBy from object to string (if exists)
  const transformedPayments = tripObj.onTripPayments?.map(payment => ({
    ...payment,
    addedBy: payment.addedBy?.name || payment.addedBy || payment.addedByRole || 'Unknown',
  })) || tripObj.onTripPayments;

  // Get driverPhoneNumber from trip object (Mongoose document) or tripObj (plain object)
  const driverPhone = trip.driverPhoneNumber || tripObj.driverPhoneNumber || null;

  return {
    ...tripObj,
    id: tripObj._id,
    agentId: tripObj.agent?._id || tripObj.agentId?._id || tripObj.agentId,
    agent: tripObj.agent?.name || tripObj.agentId?.name || tripObj.agent,
    attachments: transformedAttachments,
    onTripPayments: transformedPayments,
    // Explicitly include driverPhoneNumber - ensure it's always included
    driverPhoneNumber: driverPhone,
  };
};

// @desc    Get distinct company names for dropdowns
// @route   GET /api/trips/companies
// @access  Public
const getCompanyNames = async (req, res) => {
  try {
    const { search } = req.query || {};
    const filter = {};

    // Optional fuzzy search filter
    if (search && search.trim()) {
      filter.companyName = { $regex: search.trim(), $options: 'i' };
    }

    // Pull saved companies from admin list
    const savedCompanies = await Company.find(
      search && search.trim() ? { name: { $regex: search.trim(), $options: 'i' } } : {}
    )
      .collation({ locale: 'en', strength: 2 })
      .sort({ name: 1 })
      .select('name')
      .lean();

    // Also include historic names from trips as fallback
    const tripCompanies = await Trip.distinct('companyName', filter);

    const merged = [
      ...savedCompanies.map(c => c.name),
      ...tripCompanies,
    ];

    const cleaned = Array.from(new Set(merged))
      .filter(Boolean)
      .map(name => name.trim())
      .filter(name => name.length > 0)
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

    res.json(cleaned);
  } catch (error) {
    console.error('Get company names error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all trips
// @route   GET /api/trips
// @access  Public
const getTrips = async (req, res) => {
  try {
    const { agentId, branch, status, lrNumber, page = 1, limit = 50, startDate, endDate, lrSheet } = req.query;
    let query = {};

    // No role-based filtering - all trips visible to all
    // Additional filters
    if (agentId) {
      query.agent = agentId;
    }
    if (branch) {
      query.branch = branch;
    }
    if (status) {
      query.status = status;
    }
    if (lrSheet) {
      // Use case-insensitive regex for more robust matching
      // If filtering for "Not Received", we should also include trips where the field is missing/null/empty
      if (lrSheet === 'Not Received') {
        query.$or = [
          { lrSheet: { $regex: new RegExp(`^${lrSheet}$`, 'i') } },
          { lrSheet: { $exists: false } },
          { lrSheet: null },
          { lrSheet: '' }
        ];
      } else {
        query.lrSheet = { $regex: new RegExp(`^${lrSheet}`, 'i') };
      }
    }
    if (lrNumber) {
      query.$or = [
        { lrNumber: { $regex: lrNumber, $options: 'i' } },
        { tripId: { $regex: lrNumber, $options: 'i' } },
      ];
    }
    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        // Include the entire end date by setting time to end of day
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        query.date.$lte = endDateTime;
      }
    }

    const trips = await Trip.find(query)
      .populate('agent', 'name email phone branch _id')
      .populate('agentId', 'name email phone branch _id')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean(); // Use lean() to get plain objects with all fields

    const total = await Trip.countDocuments(query);

    // Transform trips to match frontend expectations
    const transformedTrips = trips.map(trip => {
      // Since we used lean(), trip is already a plain object
      return {
        ...trip,
        id: trip._id,
        agentId: trip.agent?._id || trip.agentId?._id || trip.agentId,
        agent: trip.agent?.name || trip.agentId?.name || trip.agent,
        // Ensure agent object is available for frontend
        agentDetails: trip.agent || trip.agentId,
        // Explicitly include driverPhoneNumber
        driverPhoneNumber: trip.driverPhoneNumber || null,
      };
    });

    // Return array format for frontend compatibility
    res.json(transformedTrips);
  } catch (error) {
    console.error('Get trips error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single trip
// @route   GET /api/trips/:id
// @access  Public
const getTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id)
      .populate('agent', 'name email phone branch _id')
      .populate('agentId', 'name email phone branch _id')
      .populate('onTripPayments.addedBy', 'name role _id')
      .populate('attachments.uploadedBy', 'name role _id')
      .lean(); // Use lean() to get plain object with all fields

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // No access check - public access
    // Transform to match frontend expectations
    // Since we used lean(), trip is already a plain object
    const transformedTrip = {
      ...trip,
      id: trip._id,
      agentId: trip.agent?._id || trip.agentId?._id || trip.agentId,
      agent: trip.agent?.name || trip.agentId?.name || trip.agent,
      // Explicitly include driverPhoneNumber
      driverPhoneNumber: trip.driverPhoneNumber || null,
    };

    res.json(transformedTrip);
  } catch (error) {
    console.error('Get trip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create trip
// @route   POST /api/trips
// @access  Public
const createTrip = async (req, res) => {
  try {
    const {
      lrNumber,
      tripId,
      date,
      truckNumber,
      companyName,
      routeFrom,
      routeTo,
      tonnage,
      lrSheet,
      isBulk,
      freightAmount,
      advancePaid,
      agentId, // Frontend se agentId aayega
      branchId, // Frontend se branchId aayega (optional)
      driverPhoneNumber, // Driver phone number (mandatory)
    } = req.body;

    if (!agentId) {
      return res.status(400).json({ message: 'agentId is required' });
    }

    // Validate driver phone number
    if (!driverPhoneNumber || !driverPhoneNumber.trim()) {
      return res.status(400).json({ message: 'Driver phone number is required' });
    }

    const trimmedDriverPhone = driverPhoneNumber.trim();
    console.log('Creating trip with driverPhoneNumber:', trimmedDriverPhone); // Debug log

    // Check for duplicate LR number - Case insensitive and check both lrNumber and tripId
    if (lrNumber) {
      const trimmedLrNumber = lrNumber.trim();
      // Case-insensitive search for duplicate LR number
      const existingTripByLR = await Trip.findOne({
        $or: [
          { lrNumber: { $regex: new RegExp(`^${trimmedLrNumber}$`, 'i') } },
          { tripId: { $regex: new RegExp(`^${trimmedLrNumber}$`, 'i') } }
        ]
      });

      if (existingTripByLR) {
        return res.status(400).json({
          message: `LR Number "${lrNumber}" already exists in the system. Please search for this LR number using the search function or use a different LR number.`,
          duplicateLrNumber: lrNumber,
          existingTripId: existingTripByLR._id
        });
      }
    }

    // Get agent to get branch if branchId not provided
    const User = require('../models/User');
    const agent = await User.findById(agentId);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Calculate balance
    const freight = isBulk ? 0 : (parseFloat(freightAmount) || 0);
    const advance = isBulk ? 0 : (parseFloat(advancePaid) || 0);
    const balance = freight - advance;

    const trip = await Trip.create({
      lrNumber,
      tripId: tripId || lrNumber,
      date,
      truckNumber,
      companyName,
      routeFrom,
      routeTo,
      route: `${routeFrom} - ${routeTo}`,
      tonnage: parseFloat(tonnage) || 0,
      lrSheet: lrSheet || 'Not Received',
      isBulk: isBulk || false,
      type: isBulk ? 'Bulk' : 'Normal',
      freight,
      freightAmount: freight,
      advance,
      advancePaid: advance,
      balance,
      balanceAmount: balance,
      status: 'Active',
      agent: agentId,
      agentId: agentId,
      branch: branchId || agent.branch || null,
      driverPhoneNumber: trimmedDriverPhone,
    });

    console.log('Trip created successfully with driverPhoneNumber:', trip.driverPhoneNumber); // Debug log

    // Create ledger entry - Only debit the advance amount paid by agent, NOT the freight
    // Freight is informational, not a wallet transaction
    if (!isBulk && advance > 0) {
      try {
        const ledgerEntry = await Ledger.create({
          tripId: trip._id,
          lrNumber: trip.lrNumber,
          date: trip.date,
          description: `Trip created - ${routeFrom} to ${routeTo} (Advance paid: Rs ${advance})`,
          type: 'Trip Created',
          amount: advance, // Only debit the advance amount, not freight
          advance: advance,
          balance: balance,
          agent: agentId,
          agentId: agentId,
          bank: 'HDFC Bank',
          direction: 'Debit',
        });
        console.log('Ledger entry created successfully:', {
          id: ledgerEntry._id,
          type: ledgerEntry.type,
          amount: ledgerEntry.amount,
          lrNumber: ledgerEntry.lrNumber,
          agentId: ledgerEntry.agentId
        });
      } catch (ledgerError) {
        console.error('Error creating ledger entry for trip:', ledgerError);
        // Don't fail the trip creation if ledger entry fails
        // But log it for debugging
      }
    } else if (!isBulk && advance === 0) {
      console.log('No ledger entry created: advance is 0 or trip is bulk');
    }

    // Populate trip with error handling
    let populatedTrip;
    try {
      populatedTrip = await Trip.findById(trip._id)
        .populate('agent', 'name email phone branch _id')
        .populate('agentId', 'name email phone branch _id')
        .lean(); // Use lean() to get plain object with all fields including driverPhoneNumber
    } catch (populateError) {
      console.error('Populate error (non-critical):', populateError);
      // If populate fails, use trip without populate
      populatedTrip = trip.toObject ? trip.toObject() : trip;
    }

    // Transform trip with error handling
    let transformedTrip;
    try {
      // Since we used lean(), populatedTrip is already a plain object
      const tripObj = populatedTrip;
      transformedTrip = {
        ...tripObj,
        id: tripObj._id || trip._id,
        agentId: tripObj.agent?._id || tripObj.agentId?._id || tripObj.agentId || agentId,
        agent: tripObj.agent?.name || tripObj.agentId?.name || tripObj.agent || agent?.name || 'Unknown',
        // Explicitly include driverPhoneNumber - this is critical!
        driverPhoneNumber: tripObj.driverPhoneNumber || trip.driverPhoneNumber || trimmedDriverPhone || null,
      };
      console.log('Transformed trip driverPhoneNumber:', transformedTrip.driverPhoneNumber); // Debug log
    } catch (transformError) {
      console.error('Transform error (non-critical):', transformError);
      // If transform fails, send basic trip data with driverPhoneNumber
      transformedTrip = {
        ...(populatedTrip.toObject ? populatedTrip.toObject() : populatedTrip),
        id: trip._id,
        agentId: agentId,
        agent: agent?.name || 'Unknown',
        driverPhoneNumber: trip.driverPhoneNumber || trimmedDriverPhone || null,
      };
    }

    // Create audit log (don't fail if this fails)
    try {
      await createAuditLog(
        agentId,
        agent?.role || 'Agent',
        'Create Trip',
        'Trip',
        trip._id,
        {
          lrNumber: trip.lrNumber,
          route: trip.route,
          freight: trip.freight,
          advance: trip.advance,
          status: trip.status,
        },
        req.ip
      );
    } catch (auditError) {
      console.error('Audit log error (non-critical):', auditError);
      // Continue even if audit log fails
    }

    res.status(201).json(transformedTrip);
  } catch (error) {
    console.error('Create trip error:', error);
    console.error('Error stack:', error.stack);
    // If trip was created but response failed, still return success
    try {
      const existingTrip = await Trip.findOne({ lrNumber: req.body.lrNumber });
      if (existingTrip) {
        // Trip was created, return it even if there was an error
        const basicTrip = {
          ...existingTrip.toObject(),
          id: existingTrip._id,
          agentId: req.body.agentId,
          agent: 'Unknown',
        };
        return res.status(201).json(basicTrip);
      }
    } catch (checkError) {
      console.error('Error checking existing trip:', checkError);
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update trip
// @route   PUT /api/trips/:id
// @access  Public
const updateTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // No permission checks - public access
    // Update allowed fields
    if (req.body.status !== undefined) {
      trip.status = req.body.status;
    }
    if (req.body.lrSheet !== undefined) {
      trip.lrSheet = req.body.lrSheet;
    }

    const updatedTrip = await trip.save();

    // Populate trip with error handling
    let populatedTrip;
    try {
      populatedTrip = await Trip.findById(updatedTrip._id)
        .populate('agent', 'name email phone branch _id')
        .populate('agentId', 'name email phone branch _id');
    } catch (populateError) {
      console.error('Populate error (non-critical):', populateError);
      populatedTrip = updatedTrip;
    }

    // Transform trip with error handling
    let transformedTrip;
    try {
      transformedTrip = transformTrip(populatedTrip);
    } catch (transformError) {
      console.error('Transform error (non-critical):', transformError);
      transformedTrip = {
        ...(populatedTrip.toObject ? populatedTrip.toObject() : populatedTrip),
        id: updatedTrip._id,
        agentId: updatedTrip.agent,
        agent: 'Unknown',
      };
    }

    // Create audit log (don't fail if this fails)
    try {
      const userId = req.body.userId || trip.agent || null;
      const userRole = req.body.userRole || 'Agent';
      await createAuditLog(
        userId,
        userRole,
        'Update Trip',
        'Trip',
        trip._id,
        {
          changes: req.body,
          previousStatus: trip.status,
        },
        req.ip
      );
    } catch (auditError) {
      console.error('Audit log error (non-critical):', auditError);
    }

    res.json(transformedTrip);
  } catch (error) {
    console.error('Update trip error:', error);
    console.error('Error stack:', error.stack);
    // If trip was updated but response failed, still return success
    try {
      const existingTrip = await Trip.findById(req.params.id);
      if (existingTrip) {
        const basicTrip = {
          ...existingTrip.toObject(),
          id: existingTrip._id,
          agentId: existingTrip.agent,
          agent: 'Unknown',
        };
        return res.json(basicTrip);
      }
    } catch (checkError) {
      console.error('Error checking existing trip:', checkError);
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete trip
// @route   DELETE /api/trips/:id
// @access  Public
const deleteTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Create audit log before deleting
    const userId = req.body.userId || trip.agent || null;
    const userRole = req.body.userRole || 'Agent';
    await createAuditLog(
      userId,
      userRole,
      'Delete Trip',
      'Trip',
      trip._id,
      {
        lrNumber: trip.lrNumber,
        route: trip.route,
      },
      req.ip
    );

    await Trip.findByIdAndDelete(req.params.id);

    res.json({ message: 'Trip deleted successfully' });
  } catch (error) {
    console.error('Delete trip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Add on-trip payment
// @route   POST /api/trips/:id/payments
// @access  Public
const addPayment = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Check if trip is Active
    if (trip.status !== 'Active') {
      return res.status(400).json({ message: 'Mid-trip payments can only be added for Active trips' });
    }

    const { amount, reason, mode, bank, agentId, userRole, userId } = req.body;

    // IMPORTANT: Payment should be deducted from the agent who is making the payment, NOT the trip creator
    // Rule: 
    // - If Finance is adding payment: Use agentId from body (selected agent)
    // - If Agent is adding payment: Use userId (logged-in agent making the payment)
    // - Fallback: trip.agent (only if agentId and userId both not available)
    let targetAgentId;
    if (userRole === 'Finance') {
      // Finance payment: Use selected agent from dropdown
      if (!agentId) {
        return res.status(400).json({ message: 'Agent selection is required for Finance payments' });
      }
      targetAgentId = agentId;
    } else {
      // Agent payment: Use logged-in agent (who is making the payment)
      if (!userId) {
        return res.status(400).json({ message: 'User ID is required for Agent payments' });
      }
      targetAgentId = userId;
    }

    const paymentAmount = parseFloat(amount);
    const isFinancePayment = userRole === 'Finance';

    console.log(`Adding payment: LR ${trip.lrNumber}, Amount ${paymentAmount}, UserRole ${userRole}, Passed agentId ${agentId}, UserId ${userId}, Trip agent ${trip.agent}, Using targetAgentId ${targetAgentId} (payment will be deducted from this agent's account)`);

    const payment = {
      amount: paymentAmount,
      reason,
      mode: mode || 'Cash',
      bank: bank || (mode === 'Cash' ? 'Cash' : ''),
      addedBy: userId || targetAgentId, // Use userId if Finance, otherwise agentId
      addedByRole: userRole || 'Agent', // Store who made the payment
    };

    trip.onTripPayments.push(payment);

    // Recalculate balance with new logic:
    // Cess, Kata, Excess Tonnage, Halting, Expenses, Others are ADDED to initial balance
    // Beta is SUBTRACTED from final balance
    const totalPayments = trip.onTripPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const deductions = trip.deductions || {};
    const totalAdditions = (parseFloat(deductions.cess) || 0) +
      (parseFloat(deductions.kata) || 0) +
      (parseFloat(deductions.excessTonnage) || 0) +
      (parseFloat(deductions.halting) || 0) +
      (parseFloat(deductions.expenses) || 0) +
      (parseFloat(deductions.others) || 0);
    const betaAmount = parseFloat(deductions.beta) || 0;
    const initialBalance = trip.freight - trip.advance;
    trip.balance = initialBalance + totalAdditions - betaAmount - totalPayments;
    trip.balanceAmount = trip.balance;

    await trip.save();

    // If Finance makes payment on behalf of agent, create TWO ledger entries
    if (isFinancePayment) {
      try {
        // Entry 1: Finance → Agent (Credit) - Top-up
        // Calculate agent's current balance before adding credit
        const agentLedger = await Ledger.find({ agent: targetAgentId });
        const agentBalance = agentLedger.reduce((sum, entry) => {
          if (entry.direction === 'Credit') {
            return sum + (entry.amount || 0);
          } else {
            return sum - (entry.amount || 0);
          }
        }, 0);

        await Ledger.create({
          tripId: trip._id,
          lrNumber: trip.lrNumber,
          date: new Date(),
          description: `Top-up: Top up`,
          type: 'Top-up',
          amount: paymentAmount,
          advance: 0,
          balance: agentBalance + paymentAmount,
          agent: targetAgentId,
          agentId: targetAgentId,
          bank: bank || (mode === 'Cash' ? 'Cash' : 'HDFC Bank'),
          direction: 'Credit',
          paymentMadeBy: 'Finance', // Mark as Finance payment
        });
        console.log(`Ledger entry created for Finance Credit (Top-up): LR ${trip.lrNumber}, Amount ${paymentAmount}, Agent ${targetAgentId}`);

        // Entry 2: Agent → Trip Expense (Debit) - On-Trip Payment
        await Ledger.create({
          tripId: trip._id,
          lrNumber: trip.lrNumber,
          date: new Date(),
          description: `On-trip payment: ${reason}`,
          type: 'On-Trip Payment',
          amount: paymentAmount,
          advance: 0,
          balance: trip.balance,
          agent: targetAgentId,
          agentId: targetAgentId,
          bank: bank || (mode === 'Cash' ? 'Cash' : 'HDFC Bank'),
          direction: 'Debit',
          paymentMadeBy: 'Finance', // Mark as Finance payment
        });
        console.log(`Ledger entry created for Finance Debit (On-Trip Payment): LR ${trip.lrNumber}, Amount ${paymentAmount}, Agent ${targetAgentId}`);
      } catch (ledgerError) {
        console.error(`Error creating ledger entries for Finance payment (non-critical): LR ${trip.lrNumber}, Agent ${targetAgentId}, Error:`, ledgerError);
        // Continue even if ledger entry creation fails - trip payment is already saved
      }
    } else {
      // Agent makes payment - create debit entry for payment maker AND informational entry for trip creator
      try {
        // Entry 1: Payment maker's account - Debit (balance affected)
        await Ledger.create({
          tripId: trip._id,
          lrNumber: trip.lrNumber,
          date: new Date(),
          description: `On-trip payment: ${reason}`,
          type: 'On-Trip Payment',
          amount: paymentAmount,
          advance: 0,
          balance: trip.balance,
          agent: targetAgentId,
          agentId: targetAgentId,
          bank: bank || (mode === 'Cash' ? 'Cash' : 'HDFC Bank'),
          direction: 'Debit',
          paymentMadeBy: 'Agent', // Mark as Agent payment
        });
        console.log(`Ledger entry created for Agent On-Trip Payment (Payment Maker): LR ${trip.lrNumber}, Amount ${paymentAmount}, Agent ${targetAgentId}`);

        // Entry 2: Trip creator's account - Informational entry (if different from payment maker)
        const tripCreatorId = trip.agent || trip.agentId;
        if (tripCreatorId && String(tripCreatorId) !== String(targetAgentId)) {
          // Calculate trip creator's balance (don't affect it, just show reference)
          const tripCreatorLedger = await Ledger.find({ agent: tripCreatorId });
          const tripCreatorBalance = tripCreatorLedger.reduce((sum, entry) => {
            if (entry.direction === 'Credit') {
              return sum + (entry.amount || 0);
            } else {
              return sum - (entry.amount || 0);
            }
          }, 0);

          await Ledger.create({
            tripId: trip._id,
            lrNumber: trip.lrNumber,
            date: new Date(),
            description: `On-trip payment (by another agent): ${reason}`,
            type: 'On-Trip Payment',
            amount: paymentAmount,
            advance: 0,
            balance: tripCreatorBalance, // No change to balance, just informational
            agent: tripCreatorId,
            agentId: tripCreatorId,
            bank: bank || (mode === 'Cash' ? 'Cash' : 'HDFC Bank'),
            direction: 'Debit',
            paymentMadeBy: 'Agent', // Mark as Agent payment
            isInformational: true, // Flag to indicate this entry is informational only (balance not affected)
          });
          console.log(`Ledger entry created for Trip Creator (Informational): LR ${trip.lrNumber}, Amount ${paymentAmount}, Trip Creator ${tripCreatorId}`);
        }
      } catch (ledgerError) {
        console.error(`Error creating ledger entries for Agent On-Trip Payment (non-critical): LR ${trip.lrNumber}, Agent ${targetAgentId}, Error:`, ledgerError);
        // Continue even if ledger entry creation fails - trip payment is already saved
      }
    }

    // Populate trip with error handling
    let populatedTrip;
    try {
      populatedTrip = await Trip.findById(trip._id)
        .populate('agent', 'name email phone branch _id')
        .populate('agentId', 'name email phone branch _id')
        .populate('onTripPayments.addedBy', 'name role _id');
    } catch (populateError) {
      console.error('Populate error (non-critical):', populateError);
      // If populate fails, use trip without populate
      populatedTrip = trip;
    }

    // Transform trip with error handling
    let transformedTrip;
    try {
      transformedTrip = transformTrip(populatedTrip);
    } catch (transformError) {
      console.error('Transform error (non-critical):', transformError);
      // If transform fails, send basic trip data
      transformedTrip = {
        ...(populatedTrip.toObject ? populatedTrip.toObject() : populatedTrip),
        id: trip._id,
        agentId: targetAgentId,
        agent: 'Unknown',
      };
    }

    // Create audit log (don't fail if this fails)
    try {
      await createAuditLog(
        userId || targetAgentId,
        userRole || 'Agent',
        'Add Payment',
        'Trip',
        trip._id,
        {
          amount: paymentAmount,
          reason,
          mode,
          lrNumber: trip.lrNumber,
          isFinancePayment,
        },
        req.ip
      );
    } catch (auditError) {
      console.error('Audit log error (non-critical):', auditError);
      // Continue even if audit log fails
    }

    res.json(transformedTrip);
  } catch (error) {
    console.error('Add payment error:', error);
    console.error('Error stack:', error.stack);
    // If payment was added but response failed, still return success
    try {
      const existingTrip = await Trip.findById(req.params.id);
      if (existingTrip && existingTrip.onTripPayments.length > 0) {
        // Payment was added, return trip even if there was an error
        const basicTrip = {
          ...existingTrip.toObject(),
          id: existingTrip._id,
          agentId: targetAgentId || existingTrip.agent,
          agent: 'Unknown',
        };
        return res.json(basicTrip);
      }
    } catch (checkError) {
      console.error('Error checking existing trip:', checkError);
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update deductions
// @route   PUT /api/trips/:id/deductions
// @access  Public
const updateDeductions = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Can only update deductions for Active trips
    if (trip.status === 'Completed') {
      return res.status(400).json({ message: 'Cannot update deductions for completed trips' });
    }

    // Store old deductions to calculate difference
    const oldDeductions = trip.deductions || {};
    const oldTotalDeductions = Object.entries(oldDeductions).reduce((sum, [key, val]) => {
      if (key === 'othersReason' || key === 'addedBy' || key === 'addedByRole') return sum;
      return sum + (parseFloat(val) || 0);
    }, 0);

    trip.deductions = { ...trip.deductions, ...req.body };

    // Calculate new totals for logging
    const newTotalAdditions = (parseFloat(trip.deductions.cess) || 0) +
      (parseFloat(trip.deductions.kata) || 0) +
      (parseFloat(trip.deductions.excessTonnage) || 0) +
      (parseFloat(trip.deductions.halting) || 0) +
      (parseFloat(trip.deductions.expenses) || 0) +
      (parseFloat(trip.deductions.others) || 0);
    const newBetaAmount = parseFloat(trip.deductions.beta) || 0;

    // Debug: Log deductions to verify addedBy is saved
    console.log('Saving deductions for LR:', trip.lrNumber, {
      addedBy: trip.deductions.addedBy,
      addedByRole: trip.deductions.addedByRole,
      totalAdditions: newTotalAdditions,
      betaAmount: newBetaAmount
    });

    // Recalculate balance with new logic:
    // Cess, Kata, Excess Tonnage, Halting, Expenses, Others are ADDED to initial balance
    // Beta is SUBTRACTED from final balance
    const deductions = trip.deductions || {};
    const totalAdditions = (parseFloat(deductions.cess) || 0) +
      (parseFloat(deductions.kata) || 0) +
      (parseFloat(deductions.excessTonnage) || 0) +
      (parseFloat(deductions.halting) || 0) +
      (parseFloat(deductions.expenses) || 0) +
      (parseFloat(deductions.others) || 0);
    const betaAmount = parseFloat(deductions.beta) || 0;
    const totalPayments = trip.onTripPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const initialBalance = trip.freight - trip.advance;
    trip.balance = initialBalance + totalAdditions - betaAmount - totalPayments;
    trip.balanceAmount = trip.balance;

    await trip.save();

    // Create ledger entry for agent who added deductions (whenever deductions are saved)
    // Get who added the deductions - prioritize req.body (current save) over existing trip data
    const deductionsAddedBy = req.body.addedBy || trip.deductions?.addedBy || trip.agent;
    const deductionsAddedByRole = req.body.addedByRole || trip.deductions?.addedByRole || 'Agent';

    // Always create/update ledger entry when deductions are saved (even if updating existing deductions)
    // This ensures the agent who saved deductions gets the entry in their ledger
    // New logic: Create separate entries for additions (Credit) and Beta (Debit)
    if ((totalAdditions > 0 || betaAmount > 0) && deductionsAddedBy && trip.status === 'Active') {
      try {
        // Get agent name who added deductions
        const deductionsAddedByUser = await User.findById(deductionsAddedBy);
        const deductionsAddedByName = deductionsAddedByUser?.name || 'Unknown Agent';

        // Helper function to get agent balance
        const getAgentBalance = async (agentId) => {
          const agentLedger = await Ledger.find({ agent: agentId });
          return agentLedger.reduce((sum, entry) => {
            if (entry.direction === 'Credit') {
              return sum + (entry.amount || 0);
            } else {
              return sum - (entry.amount || 0);
            }
          }, 0);
        };

        // Create/update Debit entry for additions (Cess, Kata, Excess Tonnage, Halting, Expenses, Others)
        if (totalAdditions > 0) {
          const existingDebitEntry = await Ledger.findOne({
            $or: [
              { tripId: trip._id },
              { lrNumber: trip.lrNumber }
            ],
            agent: deductionsAddedBy,
            agentId: deductionsAddedBy,
            type: 'Settlement',
            direction: 'Debit',
            description: { $not: /Beta|Batta/i }, // Ensure it's not the Beta entry
          });

          const agentBalance = await getAgentBalance(deductionsAddedBy);

          if (existingDebitEntry) {
            existingDebitEntry.amount = totalAdditions;
            existingDebitEntry.description = `Closing additions for ${trip.lrNumber} by ${deductionsAddedByName} (Cess: ${deductions.cess || 0}, Kata: ${deductions.kata || 0}, Excess Tonnage: ${deductions.excessTonnage || 0}, Halting: ${deductions.halting || 0}, Expenses: ${deductions.expenses || 0}, Others: ${deductions.others || 0})`;
            existingDebitEntry.deductionsAddedBy = deductionsAddedBy;
            existingDebitEntry.paymentMadeBy = deductionsAddedByRole;
            await existingDebitEntry.save();
            const newBalance = await getAgentBalance(deductionsAddedBy);
            existingDebitEntry.balance = newBalance;
            await existingDebitEntry.save();
            console.log(`Debit entry updated for Closing Additions: LR ${trip.lrNumber}, Amount ${totalAdditions}`);
          } else {
            await Ledger.create({
              tripId: trip._id,
              lrNumber: trip.lrNumber,
              date: new Date(),
              description: `Closing additions for ${trip.lrNumber} by ${deductionsAddedByName} (Cess: ${deductions.cess || 0}, Kata: ${deductions.kata || 0}, Excess Tonnage: ${deductions.excessTonnage || 0}, Halting: ${deductions.halting || 0}, Expenses: ${deductions.expenses || 0}, Others: ${deductions.others || 0})`,
              type: 'Settlement',
              amount: totalAdditions,
              advance: 0,
              balance: agentBalance - totalAdditions, // Debit reduces balance
              agent: deductionsAddedBy,
              agentId: deductionsAddedBy,
              bank: 'HDFC Bank',
              direction: 'Debit',
              paymentMadeBy: deductionsAddedByRole,
              deductionsAddedBy: deductionsAddedBy,
            });
            console.log(`Debit entry created for Closing Additions: LR ${trip.lrNumber}, Amount ${totalAdditions}`);
          }
        }

        // Create/update Debit entry for Beta
        if (betaAmount > 0) {
          const existingBetaEntry = await Ledger.findOne({
            $or: [
              { tripId: trip._id },
              { lrNumber: trip.lrNumber }
            ],
            agent: deductionsAddedBy,
            agentId: deductionsAddedBy,
            type: 'Settlement',
            direction: 'Debit',
            description: { $regex: /Beta|Batta/i },
          });

          const agentBalance = await getAgentBalance(deductionsAddedBy);

          if (existingBetaEntry) {
            existingBetaEntry.amount = betaAmount;
            existingBetaEntry.description = `Beta/Batta deduction for ${trip.lrNumber} by ${deductionsAddedByName} (Beta: ${betaAmount})`;
            existingBetaEntry.deductionsAddedBy = deductionsAddedBy;
            existingBetaEntry.paymentMadeBy = deductionsAddedByRole;
            const newBalance = await getAgentBalance(deductionsAddedBy);
            existingBetaEntry.balance = newBalance;
            await existingBetaEntry.save();
            console.log(`Debit entry updated for Beta: LR ${trip.lrNumber}, Amount ${betaAmount}`);
          } else {
            await Ledger.create({
              tripId: trip._id,
              lrNumber: trip.lrNumber,
              date: new Date(),
              description: `Beta/Batta deduction for ${trip.lrNumber} by ${deductionsAddedByName} (Beta: ${betaAmount})`,
              type: 'Settlement',
              amount: betaAmount,
              advance: 0,
              balance: agentBalance - betaAmount,
              agent: deductionsAddedBy,
              agentId: deductionsAddedBy,
              bank: 'HDFC Bank',
              direction: 'Debit',
              paymentMadeBy: deductionsAddedByRole,
              deductionsAddedBy: deductionsAddedBy,
            });
            console.log(`Debit entry created for Beta: LR ${trip.lrNumber}, Amount ${betaAmount}`);
          }
        }
      } catch (ledgerError) {
        console.error(`Error creating ledger entry for Closing Deductions (non-critical): LR ${trip.lrNumber}, Error:`, ledgerError);
      }
    }

    // Populate trip with error handling
    let populatedTrip;
    try {
      populatedTrip = await Trip.findById(trip._id)
        .populate('agent', 'name email phone branch _id')
        .populate('agentId', 'name email phone branch _id');
    } catch (populateError) {
      console.error('Populate error (non-critical):', populateError);
      populatedTrip = trip;
    }

    // Transform trip with error handling
    let transformedTrip;
    try {
      transformedTrip = transformTrip(populatedTrip);
    } catch (transformError) {
      console.error('Transform error (non-critical):', transformError);
      transformedTrip = {
        ...(populatedTrip.toObject ? populatedTrip.toObject() : populatedTrip),
        id: trip._id,
        agentId: trip.agent,
        agent: 'Unknown',
      };
    }

    // Create audit log (don't fail if this fails)
    try {
      const userId = req.body.userId || trip.agent || null;
      const userRole = req.body.userRole || 'Agent';
      await createAuditLog(
        userId,
        userRole,
        'Update Deductions',
        'Trip',
        trip._id,
        {
          deductions: req.body,
          lrNumber: trip.lrNumber,
        },
        req.ip
      );
    } catch (auditError) {
      console.error('Audit log error (non-critical):', auditError);
    }

    res.json(transformedTrip);
  } catch (error) {
    console.error('Update deductions error:', error);
    console.error('Error stack:', error.stack);
    // If trip was updated but response failed, still return success
    try {
      const existingTrip = await Trip.findById(req.params.id);
      if (existingTrip) {
        const basicTrip = {
          ...existingTrip.toObject(),
          id: existingTrip._id,
          agentId: existingTrip.agent,
          agent: 'Unknown',
        };
        return res.json(basicTrip);
      }
    } catch (checkError) {
      console.error('Error checking existing trip:', checkError);
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Close trip
// @route   POST /api/trips/:id/close
// @access  Public
const closeTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const { forceClose, closedBy, closedByRole } = req.body;
    const tripCreatorId = trip.agent || trip.agentId;

    // Check if trip has open dispute
    const openDispute = await Dispute.findOne({
      tripId: trip._id,
      status: 'Open'
    });

    // Allow force close if forceClose flag is set (for Admin/Finance)
    if (openDispute && !forceClose) {
      return res.status(400).json({ message: 'Cannot close trip with open dispute. Use forceClose=true for Admin/Finance override.' });
    }

    // Handle Bulk trips - mark as Completed directly
    if (trip.isBulk) {
      trip.status = 'Completed';
      trip.closedAt = new Date();
      trip.closedBy = trip.agent; // Use trip's agent
      await trip.save();

      // Populate trip with error handling
      let populatedTrip;
      try {
        populatedTrip = await Trip.findById(trip._id)
          .populate('agent', 'name email phone branch _id')
          .populate('agentId', 'name email phone branch _id');
      } catch (populateError) {
        console.error('Populate error (non-critical):', populateError);
        populatedTrip = trip;
      }

      // Transform trip with error handling
      let transformedTrip;
      try {
        transformedTrip = transformTrip(populatedTrip);
      } catch (transformError) {
        console.error('Transform error (non-critical):', transformError);
        transformedTrip = {
          ...(populatedTrip.toObject ? populatedTrip.toObject() : populatedTrip),
          id: trip._id,
          agentId: trip.agent,
          agent: 'Unknown',
        };
      }

      return res.json(transformedTrip);
    }

    // For Regular trips - calculate final balance with new logic:
    // Cess, Kata, Excess Tonnage, Halting, Expenses, Others are ADDED to initial balance
    // Beta is SUBTRACTED from final balance
    const deductions = trip.deductions || {};
    const betaAmount = parseFloat(deductions.beta) || 0;

    // Calculate total additions (Cess, Kata, Excess Tonnage, Halting, Expenses, Others)
    const totalAdditions = (parseFloat(deductions.cess) || 0) +
      (parseFloat(deductions.kata) || 0) +
      (parseFloat(deductions.excessTonnage) || 0) +
      (parseFloat(deductions.halting) || 0) +
      (parseFloat(deductions.expenses) || 0) +
      (parseFloat(deductions.others) || 0);

    // Separate Finance payments from Agent payments
    // Finance payments are already credited to agent wallet, so don't deduct from finalBalance
    const agentPayments = trip.onTripPayments
      .filter(p => p.addedByRole !== 'Finance')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const financePayments = trip.onTripPayments
      .filter(p => p.addedByRole === 'Finance')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const totalPayments = trip.onTripPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const initialBalance = trip.freight - trip.advance;

    // Final balance calculation with new logic:
    // Initial Balance + (Cess + Kata + Excess Tonnage + Halting + Expenses + Others) - Beta - Agent Payments + Finance Payments
    // Finance payments are NOT deducted because they're already credited to agent wallet
    // Finance payments should INCREASE the final settlement amount
    const finalBalance = initialBalance + totalAdditions - betaAmount - agentPayments + financePayments;

    // Validation: Agent can only close when finalBalance === 0
    // If finalBalance > 0, closing agent must have enough balance to pay
    if (closedByRole === 'Agent' && Math.abs(finalBalance) > 0.01) {
      if (finalBalance > 0.01) {
        // Need to pay final amount - check closing agent's balance
        const closingAgentLedger = await Ledger.find({ agent: closedBy });
        const closingAgentBalance = closingAgentLedger.reduce((sum, entry) => {
          if (entry.direction === 'Credit') {
            return sum + (entry.amount || 0);
          } else {
            return sum - (entry.amount || 0);
          }
        }, 0);

        if (closingAgentBalance < finalBalance) {
          return res.status(400).json({
            message: `Your balance (Rs ${closingAgentBalance.toLocaleString()}) is not enough to close this trip. Required: Rs ${finalBalance.toLocaleString()}`
          });
        }
        // If balance is enough, agent should pay final amount first (handled by frontend)
        return res.status(400).json({
          message: `Cannot close trip. Final balance must be 0. Please pay Rs ${finalBalance.toLocaleString()} first.`
        });
      } else {
        // Negative balance (shouldn't happen, but handle it)
        return res.status(400).json({
          message: `Cannot close trip. Final balance must be 0. Current balance: Rs ${finalBalance.toLocaleString()}`
        });
      }
    }

    // Get who added closing deductions
    const deductionsAddedBy = deductions.addedBy || trip.agent;
    const deductionsAddedByRole = deductions.addedByRole || 'Agent';
    // tripCreatorId already declared above (line 774)

    // Create ledger entries for closing deductions (if any deductions were added)
    // Note: Entry for agent who added deductions is already created in updateDeductions
    // Here we only create entry for trip creator (if different from agent who added deductions)
    // New logic: Entries are already created in updateDeductions with separate Credit (additions) and Debit (beta) entries
    // So we just need to verify/update balances here if needed
    if ((totalAdditions > 0 || betaAmount > 0) && String(tripCreatorId).trim() !== String(deductionsAddedBy).trim()) {
      try {
        // Get agent name who added deductions for description
        const deductionsAddedByUser = await User.findById(deductionsAddedBy);
        const deductionsAddedByName = deductionsAddedByUser?.name || 'Unknown Agent';

        // Create entries for trip creator (if different from agent who added deductions)
        // New logic: Create separate Credit (additions) and Debit (beta) entries
        // Helper function to get agent balance
        const getAgentBalance = async (agentId) => {
          const agentLedger = await Ledger.find({ agent: agentId });
          return agentLedger.reduce((sum, entry) => {
            if (entry.direction === 'Credit') {
              return sum + (entry.amount || 0);
            } else {
              return sum - (entry.amount || 0);
            }
          }, 0);
        };

        // Create Debit entry for additions (if any)
        if (totalAdditions > 0) {
          const existingDebitEntry = await Ledger.findOne({
            tripId: trip._id,
            agent: tripCreatorId,
            type: 'Settlement',
            direction: 'Debit',
            description: { $not: /Beta|Batta/i },
          });

          if (!existingDebitEntry) {
            const tripCreatorBalance = await getAgentBalance(tripCreatorId);
            await Ledger.create({
              tripId: trip._id,
              lrNumber: trip.lrNumber,
              date: new Date(),
              description: `Closing additions for ${trip.lrNumber} by ${deductionsAddedByName} (Cess: ${deductions.cess || 0}, Kata: ${deductions.kata || 0}, Excess Tonnage: ${deductions.excessTonnage || 0}, Halting: ${deductions.halting || 0}, Expenses: ${deductions.expenses || 0}, Others: ${deductions.others || 0})`,
              type: 'Settlement',
              amount: totalAdditions,
              advance: 0,
              balance: tripCreatorBalance - totalAdditions,
              agent: tripCreatorId,
              agentId: tripCreatorId,
              bank: 'HDFC Bank',
              direction: 'Debit',
              paymentMadeBy: deductionsAddedByRole,
              deductionsAddedBy: deductionsAddedBy,
            });
            console.log(`Debit entry created for Trip Creator: LR ${trip.lrNumber}, Amount ${totalAdditions}`);
          }
        }

        // Create Debit entry for Beta (if any)
        if (betaAmount > 0) {
          const existingBetaEntry = await Ledger.findOne({
            tripId: trip._id,
            agent: tripCreatorId,
            type: 'Settlement',
            direction: 'Debit',
            description: { $regex: /Beta|Batta/i },
          });

          if (!existingBetaEntry) {
            const tripCreatorBalance = await getAgentBalance(tripCreatorId);
            await Ledger.create({
              tripId: trip._id,
              lrNumber: trip.lrNumber,
              date: new Date(),
              description: `Beta/Batta deduction for ${trip.lrNumber} by ${deductionsAddedByName} (Beta: ${betaAmount})`,
              type: 'Settlement',
              amount: betaAmount,
              advance: 0,
              balance: tripCreatorBalance - betaAmount,
              agent: tripCreatorId,
              agentId: tripCreatorId,
              bank: 'HDFC Bank',
              direction: 'Debit',
              paymentMadeBy: deductionsAddedByRole,
              deductionsAddedBy: deductionsAddedBy,
            });
            console.log(`Debit entry created for Trip Creator (Beta): LR ${trip.lrNumber}, Amount ${betaAmount}`);
          }
        }
      } catch (ledgerError) {
        console.error(`Error creating ledger entries for Closing Deductions (non-critical): LR ${trip.lrNumber}, Error:`, ledgerError);
      }
    }

    trip.status = 'Completed';
    trip.finalBalance = finalBalance;
    trip.closedAt = new Date();
    trip.closedBy = closedBy || trip.agent; // Store who closed the trip
    await trip.save();

    // Create final settlement ledger entry (Trip Closed)
    // This entry goes to the agent who closed the trip (not trip creator)
    const closingAgentId = closedBy || trip.agent;
    try {
      const closingAgentLedger = await Ledger.find({ agent: closingAgentId });
      const closingAgentBalance = closingAgentLedger.reduce((sum, entry) => {
        if (entry.direction === 'Credit') {
          return sum + (entry.amount || 0);
        } else {
          return sum - (entry.amount || 0);
        }
      }, 0);

      await Ledger.create({
        tripId: trip._id,
        lrNumber: trip.lrNumber,
        date: new Date(),
        description: `Trip closed - Final settlement for ${trip.lrNumber} (Closed by: ${closedByRole || 'Agent'})`,
        type: 'Trip Closed',
        amount: finalBalance,
        advance: 0,
        balance: closingAgentBalance, // No change to balance (informational only)
        agent: closingAgentId,
        agentId: closingAgentId,
        bank: 'HDFC Bank',
        direction: 'Debit',
        paymentMadeBy: closedByRole || 'Agent', // Track who closed the trip
        isInformational: true, // Mark as informational (balance not affected)
      });
      console.log(`Ledger entry created for Trip Closed: LR ${trip.lrNumber}, Amount ${finalBalance}, Closed by ${closingAgentId}`);
    } catch (ledgerError) {
      console.error(`Error creating ledger entry for Trip Closed (non-critical): LR ${trip.lrNumber}, Error:`, ledgerError);
    }

    // Beta/Batta Credit Back
    if (betaAmount > 0) {
      const agentLedger = await Ledger.find({ agent: trip.agent });
      const agentBalance = agentLedger.reduce((sum, entry) => {
        if (entry.direction === 'Credit') {
          return sum + (entry.amount || 0);
        } else {
          return sum - (entry.amount || 0);
        }
      }, 0);

      await Ledger.create({
        tripId: trip._id,
        lrNumber: trip.lrNumber,
        date: new Date(),
        description: `Beta/Batta credited back for ${trip.lrNumber}`,
        type: 'Beta/Batta Credit',
        amount: betaAmount,
        advance: 0,
        balance: agentBalance + betaAmount,
        agent: trip.agent,
        agentId: trip.agent,
        bank: 'HDFC Bank',
        direction: 'Credit',
      });
    }

    // Populate trip with error handling
    let populatedTrip;
    try {
      populatedTrip = await Trip.findById(trip._id)
        .populate('agent', 'name email phone branch _id')
        .populate('agentId', 'name email phone branch _id');
    } catch (populateError) {
      console.error('Populate error (non-critical):', populateError);
      populatedTrip = trip;
    }

    // Transform trip with error handling
    let transformedTrip;
    try {
      transformedTrip = transformTrip(populatedTrip);
    } catch (transformError) {
      console.error('Transform error (non-critical):', transformError);
      transformedTrip = {
        ...(populatedTrip.toObject ? populatedTrip.toObject() : populatedTrip),
        id: trip._id,
        agentId: trip.agent,
        agent: 'Unknown',
      };
    }

    // Create audit log (don't fail if this fails)
    try {
      const userId = req.body.userId || trip.agent || null;
      const userRole = req.body.userRole || 'Agent';
      await createAuditLog(
        userId,
        userRole,
        'Close Trip',
        'Trip',
        trip._id,
        {
          lrNumber: trip.lrNumber,
          finalBalance,
          forceClose: forceClose || false,
        },
        req.ip
      );
    } catch (auditError) {
      console.error('Audit log error (non-critical):', auditError);
    }

    res.json(transformedTrip);
  } catch (error) {
    console.error('Close trip error:', error);
    console.error('Error stack:', error.stack);
    // If trip was closed but response failed, still return success
    try {
      const existingTrip = await Trip.findById(req.params.id);
      if (existingTrip && existingTrip.status === 'Completed') {
        // Trip was closed, return it even if there was an error
        const basicTrip = {
          ...existingTrip.toObject(),
          id: existingTrip._id,
          agentId: existingTrip.agent,
          agent: 'Unknown',
        };
        return res.json(basicTrip);
      }
    } catch (checkError) {
      console.error('Error checking existing trip:', checkError);
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Add attachment
// @route   POST /api/trips/:id/attachments
// @access  Public
const addAttachment = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Check max 10 files limit
    if (trip.attachments.length >= 10) {
      return res.status(400).json({ message: 'Maximum 10 attachments allowed per trip' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log('DEBUG: addAttachment called');
    console.log('DEBUG: req.file:', req.file);

    const { uploadedBy } = req.body; // Get uploadedBy from body

    const attachment = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      uploadedBy: uploadedBy || trip.agent, // Use uploadedBy from body or trip's agent
    };

    console.log('DEBUG: Attachment object to push:', attachment);

    trip.attachments.push(attachment);
    await trip.save();

    const populatedTrip = await Trip.findById(trip._id)
      .populate('agent', 'name email phone branch _id')
      .populate('agentId', 'name email phone branch _id')
      .populate('attachments.uploadedBy', 'name role _id');

    res.json(transformTrip(populatedTrip));
  } catch (error) {
    console.error('Add attachment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete attachment
// @route   DELETE /api/trips/:id/attachments/:attachmentId
// @access  Private/Finance, Admin
const deleteAttachment = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    trip.attachments = trip.attachments.filter(
      att => att._id.toString() !== req.params.attachmentId
    );

    await trip.save();

    const populatedTrip = await Trip.findById(trip._id)
      .populate('agent', 'name email phone branch _id')
      .populate('agentId', 'name email phone branch _id')
      .populate('attachments.uploadedBy', 'name role _id');

    res.json(transformTrip(populatedTrip));
  } catch (error) {
    console.error('Delete attachment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getTrips,
  getTrip,
  createTrip,
  updateTrip,
  deleteTrip,
  addPayment,
  updateDeductions,
  closeTrip,
  addAttachment,
  deleteAttachment,
  getCompanyNames,
};

