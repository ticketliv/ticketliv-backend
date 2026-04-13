const { query } = require('../../config/database');
const { asyncHandler } = require('../../middleware/errorHandler');
const qrService = require('../tickets/qr.service');
const { emitScanEvent } = require('../../config/socket');
const { v4: uuidv4 } = require('uuid');

// POST /scanner/validate — Validate a single ticket QR
exports.validateTicket = asyncHandler(async (req, res) => {
  const { qr_data, gate, event_id, api_key, location } = req.body;
  const scannerId = req.user?.id;

  // Step 0: Vendor Auth (API Key or JWT)
  if (!scannerId && !api_key) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  // Step 1: Decrypt and verify QR token
  const verification = qrService.verifyQRToken(qr_data);
  if (!verification.valid) {
    await logScan(null, event_id, scannerId, gate, 'invalid', req);
    return res.json({
      success: false,
      result: 'INVALID',
      message: `Invalid QR code: ${verification.error}`,
      status: 'error',
    });
  }

  const qrPayload = verification.data;

  // Step 2: Check ticket exists in database
  const ticketResult = await query(`
    SELECT t.*, e.title as event_title, e.start_date, e.venue_name, tt.name as ticket_type_name
    FROM tickets t
    JOIN events e ON t.event_id = e.id
    LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
    WHERE t.ticket_number = $1
  `, [qrPayload.tid]);

  if (ticketResult.rows.length === 0) {
    await logScan(null, event_id, scannerId, gate, 'invalid', req);
    return res.json({
      success: false,
      result: 'INVALID',
      message: 'Ticket not found in system',
    });
  }

  const ticket = ticketResult.rows[0];

  // Step 3: Check if already scanned (duplicate detection)
  if (ticket.scan_status === 'scanned') {
    await logScan(ticket.id, event_id, scannerId, gate, 'duplicate', req);
    
    // Emit real-time alert for duplicate scan
    emitScanEvent(event_id, {
      type: 'DUPLICATE_ALERT',
      ticketNumber: ticket.ticket_number,
      attendeeName: ticket.attendee_name,
      gate,
      previousScan: ticket.scanned_at,
    });

    return res.json({
      success: false,
      result: 'DUPLICATE',
      message: `Already scanned at ${ticket.gate || 'unknown gate'} on ${new Date(ticket.scanned_at).toLocaleString()}`,
      ticket: {
        ticketNumber: ticket.ticket_number,
        attendeeName: ticket.attendee_name,
        previousGate: ticket.gate,
        previousScanTime: ticket.scanned_at,
      },
    });
  }

  // Step 4: Check if ticket is cancelled
  if (ticket.scan_status === 'cancelled') {
    await logScan(ticket.id, event_id, scannerId, gate, 'cancelled', req);
    return res.json({
      success: false,
      result: 'CANCELLED',
      message: 'This ticket has been cancelled',
    });
  }

  // Step 5: Verify event matches
  if (event_id && ticket.event_id !== event_id) {
    await logScan(ticket.id, event_id, scannerId, gate, 'invalid', req);
    return res.json({
      success: false,
      result: 'WRONG_EVENT',
      message: 'This ticket is for a different event',
      status: 'error',
    });
  }

  // Step 5b: Geo-location validation (Fraud detection)
  if (location && ticket.metadata?.allowed_locations) {
    const allowed = ticket.metadata.allowed_locations.some(loc => 
      Math.abs(loc.lat - location.lat) < 0.01 && Math.abs(loc.lng - location.lng) < 0.01
    );
    if (!allowed) {
      await logScan(ticket.id, ticket.event_id, scannerId, gate, 'fraud_geo', req);
      return res.json({
        success: false,
        result: 'FRAUD_ALERT',
        message: 'Entry denied: Location mismatch detected',
        status: 'warning',
      });
    }
  }

  // Step 6: Mark as scanned
  await query(`
    UPDATE tickets SET 
      scan_status = 'scanned', 
      scanned_at = NOW(), 
      scanned_by = $1, 
      gate = $2,
      metadata = jsonb_set(COALESCE(metadata, '{}'), '{last_scan_location}', $4)
    WHERE id = $3
  `, [scannerId, gate, ticket.id, JSON.stringify(location || {})]);

  await logScan(ticket.id, ticket.event_id, scannerId, gate, 'valid', req);

  // Emit real-time scan event
  emitScanEvent(ticket.event_id, {
    type: 'VALID_SCAN',
    ticketNumber: ticket.ticket_number,
    attendeeName: ticket.attendee_name,
    gate,
    ticketType: ticket.ticket_type_name,
    timestamp: new Date().toISOString(),
  });

  res.json({
    success: true,
    result: 'VALID',
    message: 'Entry approved',
    status: 'success',
    ticket: {
      ticketNumber: ticket.ticket_number,
      attendeeName: ticket.attendee_name,
      ticketType: ticket.ticket_type_name,
      eventTitle: ticket.event_title,
      seat: ticket.metadata?.seat || 'GA',
      gate,
      branding: ticket.metadata?.branding || {},
    },
  });
});

// POST /scanner/batch — Batch validate multiple tickets
exports.batchValidate = asyncHandler(async (req, res) => {
  const { scans } = req.body; // Array of { qr_data, gate }
  const results = [];

  for (const scan of scans) {
    const verification = qrService.verifyQRToken(scan.qr_data);
    if (!verification.valid) {
      results.push({ qr_data: scan.qr_data, result: 'INVALID' });
      continue;
    }

    const ticketResult = await query(
      'SELECT id, scan_status, ticket_number, attendee_name FROM tickets WHERE ticket_number = $1',
      [verification.data.tid]
    );

    if (ticketResult.rows.length === 0) {
      results.push({ ticket_number: verification.data.tid, result: 'NOT_FOUND' });
    } else if (ticketResult.rows[0].scan_status === 'scanned') {
      results.push({ ticket_number: verification.data.tid, result: 'DUPLICATE' });
    } else {
      await query(
        "UPDATE tickets SET scan_status = 'scanned', scanned_at = NOW(), scanned_by = $1, gate = $2 WHERE id = $3",
        [req.user.id, scan.gate, ticketResult.rows[0].id]
      );
      results.push({ ticket_number: verification.data.tid, result: 'VALID', attendee_name: ticketResult.rows[0].attendee_name });
    }
  }

  res.json({ success: true, data: results });
});

// GET /scanner/stats/:eventId — Real-time scan statistics
exports.getStats = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  const stats = await query(`
    SELECT 
      COUNT(*) FILTER (WHERE scan_status = 'scanned')::INTEGER as total_scanned,
      COUNT(*) FILTER (WHERE scan_status = 'unused')::INTEGER as total_unscanned,
      COUNT(*)::INTEGER as total_tickets
    FROM tickets 
    WHERE ($1::uuid IS NULL OR event_id = $1)
  `, [eventId || null]);

  const gateStats = await query(`
    SELECT gate, COUNT(*)::INTEGER as count
    FROM scan_logs 
    WHERE ($1::uuid IS NULL OR event_id = $1) AND result = 'valid'
    GROUP BY gate ORDER BY count DESC
  `, [eventId || null]);

  const recentScans = await query(`
    SELECT sl.*, t.ticket_number, t.attendee_name
    FROM scan_logs sl
    LEFT JOIN tickets t ON sl.ticket_id = t.id
    WHERE ($1::uuid IS NULL OR sl.event_id = $1) AND sl.result = 'valid'
    ORDER BY sl.scanned_at DESC LIMIT 20
  `, [eventId || null]);

  const duplicateAttempts = await query(`
    SELECT COUNT(*)::INTEGER as count FROM scan_logs 
    WHERE ($1::uuid IS NULL OR event_id = $1) AND result = 'duplicate'
  `, [eventId || null]);

  const s = stats.rows[0];
  res.json({
    success: true,
    data: {
      totalTickets: s.total_tickets,
      totalScanned: s.total_scanned,
      totalUnscanned: s.total_unscanned,
      attendanceRate: s.total_tickets > 0 ? Math.round((s.total_scanned / s.total_tickets) * 100) : 0,
      gateStats: gateStats.rows,
      recentScans: recentScans.rows,
      duplicateAttempts: duplicateAttempts.rows[0]?.count || 0,
    },
  });
});

// GET /scanner/event/:eventId/manifest — Offline ticket manifest
exports.getOfflineManifest = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  const tickets = await query(
    'SELECT ticket_number, scan_status FROM tickets WHERE event_id = $1',
    [eventId]
  );

  const ticketHashes = tickets.rows.map(t => ({
    hash: qrService.generateTicketHash(t.ticket_number),
    status: t.scan_status,
  }));

  res.json({
    success: true,
    data: {
      eventId,
      ticketCount: tickets.rows.length,
      ticketHashes,
      generatedAt: new Date().toISOString(),
    },
  });
});

// POST /scanner/sync — Sync offline scans
exports.syncOfflineScans = asyncHandler(async (req, res) => {
  const { scans } = req.body;
  let synced = 0;

  for (const scan of scans) {
    try {
      const ticketResult = await query(
        'SELECT id, scan_status FROM tickets WHERE ticket_number = $1',
        [scan.ticket_number]
      );
      if (ticketResult.rows.length > 0 && ticketResult.rows[0].scan_status !== 'scanned') {
        await query(
          "UPDATE tickets SET scan_status = 'scanned', scanned_at = $1, gate = $2 WHERE id = $3",
          [scan.scanned_at, scan.gate, ticketResult.rows[0].id]
        );
        synced++;
      }
    } catch { /* skip failed syncs */ }
  }

  res.json({ success: true, data: { total: scans.length, synced } });
});

// GET /scanner/logs/:eventId
exports.getScanLogs = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const result = await query(`
    SELECT sl.*, t.ticket_number, t.attendee_name
    FROM scan_logs sl
    LEFT JOIN tickets t ON sl.ticket_id = t.id
    WHERE sl.event_id = $1
    ORDER BY sl.scanned_at DESC LIMIT 100
  `, [eventId]);
  res.json({ success: true, data: result.rows });
});

// Helper: Log scan attempt
async function logScan(ticketId, eventId, scannerId, gate, result, req) {
  try {
    await query(
      'INSERT INTO scan_logs (id, ticket_id, event_id, scanner_user_id, gate, result, device_info) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [uuidv4(), ticketId, eventId, scannerId, gate, result, JSON.stringify({ userAgent: req?.headers?.['user-agent'] })]
    );
  } catch { /* don't fail the scan if logging fails */ }
}
