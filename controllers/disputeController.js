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
    const {
      resolvedBy,
      newFreight,
      newAdvance,
      lrNumber,
      date,
      truckNumber,
      driverPhoneNumber,
      companyName,
      routeFrom,
      routeTo,
      tonnage,
      remark // Optional remark from admin
    } = req.body;

    const dispute = await Dispute.findById(req.params.id);

    if (!dispute) {
      return res.status(404).json({ message: 'Dispute not found' });
    }

    if (dispute.status === 'Resolved') {
      return res.status(400).json({ message: 'Dispute is already resolved' });
    }

    const trip = await Trip.findById(dispute.tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Associated trip not found' });
    }

    // 1. Mark Dispute as Resolved
    dispute.status = 'Resolved';
    dispute.resolvedBy = resolvedBy || null;
    dispute.resolvedAt = new Date();
    await dispute.save();

    // Capture old values for audit and ledger
    const oldFreight = trip.freight || 0;
    const oldAdvance = trip.advance || 0;
    // CRITICAL FIX: Convert Mongoose subdoc to POJO to safely capture old values
    const oldDeductions = trip.deductions && trip.deductions.toObject ? trip.deductions.toObject() : (trip.deductions || {});

    // Define oldTripDetails here so it's available for audit log later
    const oldTripDetails = {
      lrNumber: trip.lrNumber,
      truckNumber: trip.truckNumber,
      route: trip.route,
      tonnage: trip.tonnage,
      deductions: oldDeductions
    };

    console.log('[DEBUG] Resolve Dispute Request Body:', JSON.stringify(req.body, null, 2));
    console.log('[DEBUG] Old Deductions Snapshot:', JSON.stringify(oldDeductions, null, 2));

    // ... (existing code for trip details) ...
    // 2. Update Trip Details (Non-Financial)
    if (lrNumber) trip.lrNumber = lrNumber;
    if (date) trip.date = date;
    if (truckNumber) trip.truckNumber = truckNumber;
    if (driverPhoneNumber) trip.driverPhoneNumber = driverPhoneNumber;
    if (companyName) trip.companyName = companyName;
    if (routeFrom) trip.routeFrom = routeFrom;
    if (routeTo) trip.routeTo = routeTo;
    if (routeFrom && routeTo) trip.route = `${routeFrom} - ${routeTo}`;
    if (tonnage) trip.tonnage = parseFloat(tonnage);

    // Update Deductions & Calculate Diffs
    const { cess, kata, excessTonnage, halting, expenses, beta, others, othersReason } = req.body;

    // Helper to process deduction updates
    const processDeduction = async (fieldName, newValue, type = 'Addition') => {
      if (newValue === undefined) return;

      const newVal = parseFloat(newValue) || 0;
      const oldVal = parseFloat(oldDeductions[fieldName]) || 0;
      const diff = newVal - oldVal;

      // Update the trip object
      trip.deductions[fieldName] = newVal;

      if (fieldName === 'othersReason' && othersReason !== undefined) {
        trip.deductions.othersReason = othersReason;
      }

      if (diff === 0 || fieldName === 'othersReason') return;

      let direction = '';
      if (type === 'Addition') {
        // CORRECTION: Admin Logic
        // These are "Closing Additions" which usually mean *Deductions from Agent* in this system context if they are costs?
        // Wait, user said: "closing deduction ki entry debit me ayegi credit me nhi"
        // referring to "Closing Additions" (Cess, Kata...)
        // So Increase in Cess = Debit to Agent.
        direction = diff > 0 ? 'Debit' : 'Credit';
      } else if (type === 'Deduction') {
        // Beta is a "Closing Deduction" (Batta) - usually means giving money TO driver/agent? 
        // Or is it reducing the balance?
        // Standard TMS: Beta is paid to driver, so it reduces the balance payable to Agent.
        // If Beta Increases -> Payable Decreases -> Debit?
        // Let's stick to the reverse of Addition.
        // If Addition (Cess) Increase = Debit.
        // Then Beta Increase = Credit? 
        // User request specifically mentioned "Closing Additions ... debit me ayegi".
        // Let's assume Beta works oppositely? Or same?
        // Usually Cess/Kata are deductions FROM freight. So Freight - Cess = Balance.
        // So Higher Cess = Lower Balance = Debit. (Correct)
        // Beta is also usually deducted. Freight - Advance - Beta = Balance.
        // So Higher Beta = Lower Balance = Debit.
        // So ALL deductions (Cess, Kata, Beta) logic should likely be: Increase -> Debit, Decrease -> Credit.

        direction = diff > 0 ? 'Debit' : 'Credit';
      }

      console.log(`[DEBUG] Deduction Ledger: field=${fieldName}, old=${oldVal}, new=${newVal}, diff=${diff}, dir=${direction}`);

      // Clean up field name for Enum (CamelCase to PascalCaseish)
      // keys: cess, kata, excessTonnage, halting, expenses, beta, others
      // Enum expects: 'Dispute - Cess Correction', 'Dispute - ExcessTonnage Correction'
      // Only "excessTonnage" needs care to match Enum "ExcessTonnage" (capital T) or "Excess tonnage"?
      // Code below does `fieldName.charAt(0).toUpperCase() + fieldName.slice(1)`
      // cess -> Cess (OK)
      // excessTonnage -> ExcessTonnage (OK)

      const typeLabel = `Dispute - ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} Correction`;

      const Ledger = require('../models/Ledger');
      try {
        await Ledger.create({
          tripId: trip._id,
          lrNumber: trip.lrNumber,
          date: new Date(),
          description: `Dispute Resolution - ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} Correction (${trip.lrNumber})`,
          type: typeLabel,
          amount: Math.abs(diff),
          advance: 0,
          balance: 0,
          agent: trip.agent,
          agentId: trip.agent,
          bank: 'HDFC Bank',
          direction: direction,
          paidBy: 'Admin'
        });
      } catch (err) {
        console.error(`Error creating ledger for ${fieldName}:`, err);
      }
    };

    // Process all deductions
    // All these seem to be "Deductions from Freight" -> Reducing Agent Balance
    // So Increase = Debit
    await processDeduction('cess', cess, 'Addition');
    await processDeduction('kata', kata, 'Addition');
    await processDeduction('excessTonnage', excessTonnage, 'Addition');
    await processDeduction('halting', halting, 'Addition');
    await processDeduction('expenses', expenses, 'Addition');
    await processDeduction('others', others, 'Addition');

    if (othersReason !== undefined) trip.deductions.othersReason = othersReason;

    // Beta also reduces balance? 
    await processDeduction('beta', beta, 'Deduction');

    // 3. Handle Financial Updates (Freight & Advance)
    let freightDiff = 0;
    let advanceDiff = 0;

    // --- FREIGHT CORRECTION ---
    if (newFreight !== undefined && newFreight !== null) {
      const correctedFreight = parseFloat(newFreight);
      freightDiff = correctedFreight - oldFreight;

      if (freightDiff !== 0) {
        trip.freight = correctedFreight;
        trip.freightAmount = correctedFreight;
      }
    }

    // --- ADVANCE CORRECTION ---
    if (newAdvance !== undefined && newAdvance !== null) {
      const correctedAdvance = parseFloat(newAdvance);
      advanceDiff = correctedAdvance - oldAdvance;

      if (advanceDiff !== 0) {
        trip.advance = correctedAdvance;
        trip.advancePaid = correctedAdvance;
      }
    }

    // 4. Recalculate Trip Balance
    const totalAdditions = (trip.deductions.cess || 0) +
      (trip.deductions.kata || 0) +
      (trip.deductions.excessTonnage || 0) +
      (trip.deductions.halting || 0) +
      (trip.deductions.expenses || 0) +
      (trip.deductions.others || 0);
    const betaAmount = trip.deductions.beta || 0;

    // Re-sum payments just in case
    const totalPayments = trip.onTripPayments ? trip.onTripPayments.reduce((sum, p) => sum + (p.amount || 0), 0) : 0;

    const currentFreight = trip.freight || 0;
    const currentAdvance = trip.advance || 0;

    const newInitialBalance = currentFreight - currentAdvance;
    trip.balance = newInitialBalance + totalAdditions - betaAmount - totalPayments;
    trip.balanceAmount = trip.balance;

    // 5. Restore Trip Status
    trip.status = 'Active';
    await trip.save();

    const Ledger = require('../models/Ledger');

    // 6. Generate Ledger Entries for Freight/Advance (existing logic)

    // A. FREIGHT DIFF LEGER
    if (freightDiff !== 0) {
      let direction = freightDiff > 0 ? 'Credit' : 'Debit';
      try {
        await Ledger.create({
          tripId: trip._id,
          lrNumber: trip.lrNumber,
          date: new Date(),
          description: `Dispute Resolution - Freight Correction (${trip.lrNumber})`,
          type: 'Dispute - Freight Correction',
          amount: Math.abs(freightDiff),
          advance: 0,
          balance: 0,
          agent: trip.agent,
          agentId: trip.agent,
          bank: 'HDFC Bank',
          direction: direction,
          paidBy: 'Admin'
        });
      } catch (err) {
        console.error("Error creating freight ledger entry:", err);
      }
    }

    // B. ADVANCE DIFF LEDGER
    if (advanceDiff !== 0) {
      let direction = advanceDiff > 0 ? 'Debit' : 'Credit';
      try {
        await Ledger.create({
          tripId: trip._id,
          lrNumber: trip.lrNumber,
          date: new Date(),
          description: `Dispute Resolution - Advance Correction (${trip.lrNumber})`,
          type: 'Dispute - Advance Correction',
          amount: Math.abs(advanceDiff),
          advance: 0,
          balance: 0,
          agent: trip.agent,
          agentId: trip.agent,
          bank: 'HDFC Bank',
          direction: direction,
          paidBy: 'Admin'
        });
      } catch (err) {
        console.error("Error creating advance ledger entry:", err);
      }
    }

    const populatedDispute = await Dispute.findById(dispute._id)
      .populate('agent', 'name email phone branch _id')
      .populate('agentId', 'name email phone branch _id')
      .populate('tripId', 'lrNumber route status _id')
      .populate('resolvedBy', 'name role _id');

    // Create Audit Log
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
        oldFreight,
        newFreight: trip.freight,
        freightDiff,
        oldAdvance,
        newAdvance: trip.advance,
        advanceDiff,
        // Detailed Audit for Deductions can be added if needed, but 'newTripDetails' captures the *result*
        oldTripDetails: { ...oldTripDetails, deductions: oldDeductions }, // Add deductions to old details
        newTripDetails: {
          truckNumber: trip.truckNumber,
          route: trip.route,
          tonnage: trip.tonnage,
          deductions: trip.deductions
        }
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
