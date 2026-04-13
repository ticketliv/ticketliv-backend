const { query } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');

/**
 * Sports & Marathon Tracker
 * Handles multi-stage checkpoint scanning and bib management
 */
exports.recordCheckpoint = asyncHandler(async (req, res) => {
  const { ticket_id, checkpoint_name, event_id, metadata } = req.body;
  const scannerId = req.user.id;

  // 1. Verify ticket is for a sports/marathon event
  const ticket = await query(`
    SELECT t.*, e.category_name, e.field_config
    FROM tickets t
    JOIN events e ON t.event_id = e.id
    WHERE t.id = $1
  `, [ticket_id]);

  if (ticket.rows.length === 0) throw new AppError('Ticket not found', 404);
  
  // 2. Log checkpoint entry (Requirement 28)
  const result = await query(`
    INSERT INTO scan_logs (id, ticket_id, event_id, scanner_user_id, gate, result, device_info)
    VALUES (uuid_generate_v4(), $1, $2, $3, $4, 'valid', $5)
    RETURNING *
  `, [
    ticket_id, 
    event_id, 
    scannerId, 
    checkpoint_name, 
    JSON.stringify({ type: 'CHECKPOINT', ...metadata })
  ]);

  res.json({ 
    success: true, 
    message: `Checkpoint ${checkpoint_name} recorded`,
    data: {
      attendee: ticket.rows[0].attendee_name,
      checkpoint: checkpoint_name,
      timestamp: result.rows[0].scanned_at
    }
  });
});

/**
 * Get Marathon Participant Stats
 */
exports.getParticipantProgress = asyncHandler(async (req, res) => {
  const { ticket_id } = req.params;
  
  const history = await query(`
    SELECT gate as checkpoint, scanned_at as time
    FROM scan_logs
    WHERE ticket_id = $1 AND result = 'valid'
    ORDER BY scanned_at ASC
  `, [ticket_id]);

  res.json({ success: true, data: history.rows });
});
