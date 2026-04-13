const { query, getClient } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const { cache } = require('../../config/redis');
const { v4: uuidv4 } = require('uuid');

const generateBookingRef = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'TLV-';
  for (let i = 0; i < 8; i++) ref += chars.charAt(Math.floor(Math.random() * chars.length));
  return ref;
};

// POST /bookings
exports.create = asyncHandler(async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { event_id, selections, attendee_details, coupon_code } = req.body;
    const userId = req.user.id;

    // 1. Validate Event
    const eventResult = await client.query('SELECT * FROM events WHERE id = $1', [event_id]);
    if (eventResult.rows.length === 0) throw new AppError('Event not found', 404);
    const event = eventResult.rows[0];
    if (event.status !== 'Live') throw new AppError('Event is not currently live for booking', 400);

    // 2. Validate Attendee Details against field_config (Marathon/Sports Support)
    const fieldConfig = typeof event.field_config === 'string' ? JSON.parse(event.field_config) : (event.field_config || {});
    if (fieldConfig.requiredFields && Array.isArray(attendee_details)) {
      for (const attendee of attendee_details) {
        for (const field of fieldConfig.requiredFields) {
          if (!attendee[field.name] && field.required) {
            throw new AppError(`Field "${field.label || field.name}" is required for all attendees`, 400);
          }
        }
      }
    }

    let subtotal = 0;
    const bookingId = uuidv4();
    const bookingRef = generateBookingRef();

    // 3. Process Selections & Seat Locking
    for (const sel of selections) {
      const ttResult = await client.query(
        'SELECT * FROM ticket_types WHERE id = $1 AND event_id = $2 FOR UPDATE',
        [sel.categoryId || sel.ticket_type_id, event_id]
      );
      if (ttResult.rows.length === 0) throw new AppError(`Ticket type not found: ${sel.categoryId}`, 404);

      const ticketType = ttResult.rows[0];
      const available = ticketType.capacity - ticketType.sold_count;
      if (sel.quantity > available) throw new AppError(`Only ${available} tickets available for ${ticketType.name}`, 400);
      
      // Real-time Seat Locking (Requirement 5)
      if (sel.seats && Array.isArray(sel.seats)) {
        if (sel.seats.length !== sel.quantity) throw new AppError('Number of seats must match quantity', 400);
        for (const seatId of sel.seats) {
          const locked = await cache.lockSeat(event_id, seatId, userId);
          if (!locked) throw new AppError(`Seat ${seatId} is already held by another user`, 400);
        }
      }

      subtotal += parseFloat(ticketType.price) * sel.quantity;

      // Update sold count
      await client.query(
        'UPDATE ticket_types SET sold_count = sold_count + $1 WHERE id = $2',
        [sel.quantity, ticketType.id]
      );
    }

    // 4. Financial Calculations (Coupons, Taxes, Fees)
    let discountAmount = 0;
    let couponId = null;
    if (coupon_code) {
      const couponResult = await client.query(
        "SELECT * FROM coupons WHERE code = $1 AND status = 'Active' AND (expiry_date IS NULL OR expiry_date > NOW())",
        [coupon_code.toUpperCase()]
      );
      if (couponResult.rows.length > 0) {
        const coupon = couponResult.rows[0];
        if (subtotal >= parseFloat(coupon.min_purchase || 0)) {
          if (coupon.discount_type === 'Percentage') {
            discountAmount = (subtotal * parseFloat(coupon.discount_value)) / 100;
            if (coupon.max_discount) discountAmount = Math.min(discountAmount, parseFloat(coupon.max_discount));
          } else {
            discountAmount = parseFloat(coupon.discount_value);
          }
          couponId = coupon.id;
          await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [coupon.id]);
        }
      }
    }

    const financials = typeof event.financials === 'string' ? JSON.parse(event.financials) : (event.financials || {});
    let taxAmount = 0;
    if (financials.gstEnabled) {
      taxAmount = (subtotal * ((financials.cgstRate || 0) + (financials.sgstRate || 0))) / 100;
    }

    let serviceFee = 0;
    if (financials.platformFeeEnabled) {
      serviceFee = financials.platformFeeType === 'percentage' 
        ? (subtotal * (financials.platformFeeRate || 0)) / 100 
        : parseFloat(financials.platformFeeRate || 0);
    }

    const totalAmount = subtotal + taxAmount + serviceFee - discountAmount;

    // 5. Create Booking Record
    await client.query(`
      INSERT INTO bookings (id, booking_ref, user_id, event_id, subtotal, tax_amount, service_fee, discount_amount, total_amount, coupon_id, attendee_details, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
    `, [bookingId, bookingRef, userId, event_id, subtotal, taxAmount, serviceFee, discountAmount, totalAmount, couponId, JSON.stringify(attendee_details || [])]);

    await client.query('COMMIT');

    res.status(201).json({ 
      success: true, 
      data: {
        id: bookingId,
        booking_ref: bookingRef,
        total_amount: totalAmount,
        status: 'pending',
        expires_at: new Date(Date.now() + 10 * 60 * 1000) // 10 min expiry
      } 
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    // If error, unlock seats
    if (req.body.selections) {
      for (const sel of req.body.selections) {
        if (sel.seats) {
          for (const seatId of sel.seats) await cache.unlockSeat(req.body.event_id, seatId);
        }
      }
    }
    throw err;
  } finally {
    client.release();
  }
});

// GET /bookings
exports.getAll = asyncHandler(async (req, res) => {
  const { event_id, status, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = 'WHERE 1=1';
  const params = [];
  let idx = 1;

  if (event_id) { where += ` AND b.event_id = $${idx++}`; params.push(event_id); }
  if (status) { where += ` AND b.status = $${idx++}`; params.push(status); }

  params.push(parseInt(limit), offset);

  const result = await query(`
    SELECT b.*, u.full_name as user_name, u.email as user_email, e.title as event_title
    FROM bookings b
    LEFT JOIN users u ON b.user_id = u.id
    LEFT JOIN events e ON b.event_id = e.id
    ${where}
    ORDER BY b.created_at DESC
    LIMIT $${idx++} OFFSET $${idx}
  `, params);

  res.json({ success: true, data: result.rows });
});

// GET /bookings/:id
exports.getById = asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT b.*, u.full_name as user_name, u.email as user_email, e.title as event_title,
      json_agg(jsonb_build_object('id', t.id, 'ticket_number', t.ticket_number, 'attendee_name', t.attendee_name, 'scan_status', t.scan_status, 'qr_image_url', t.qr_image_url)) as tickets
    FROM bookings b
    LEFT JOIN users u ON b.user_id = u.id
    LEFT JOIN events e ON b.event_id = e.id
    LEFT JOIN tickets t ON b.id = t.booking_id
    WHERE b.id = $1
    GROUP BY b.id, u.full_name, u.email, e.title
  `, [req.params.id]);

  if (result.rows.length === 0) throw new AppError('Booking not found', 404);
  res.json({ success: true, data: result.rows[0] });
});

// GET /bookings/user/:userId
exports.getByUser = asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT b.*, e.title as event_title, e.start_date, e.venue_name as location, e.image_url as banner_image,
      e.entry_policy as entrance_info,
      COALESCE(
        json_agg(
          jsonb_build_object(
            'id', t.id, 
            'ticket_number', t.ticket_number, 
            'attendee_name', t.attendee_name, 
            'scan_status', t.scan_status,
            'category_name', tt.name,
            'qr_image_url', t.qr_image_url
          )
        ) FILTER (WHERE t.id IS NOT NULL), 
        '[]'
      ) as tickets
    FROM bookings b
    LEFT JOIN events e ON b.event_id = e.id
    LEFT JOIN tickets t ON b.id = t.booking_id
    LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
    WHERE b.user_id = $1
    GROUP BY b.id, e.title, e.start_date, e.venue_name, e.image_url, e.entry_policy
    ORDER BY b.created_at DESC
  `, [req.params.userId]);

  res.json({ success: true, data: result.rows });
});

// PUT /bookings/:id/cancel
exports.cancel = asyncHandler(async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    
    const booking = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (booking.rows.length === 0) throw new AppError('Booking not found', 404);
    if (booking.rows[0].status === 'cancelled') throw new AppError('Booking already cancelled', 400);

    await client.query("UPDATE bookings SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [req.params.id]);
    await client.query("UPDATE tickets SET scan_status = 'cancelled' WHERE booking_id = $1", [req.params.id]);
    
    await client.query('COMMIT');
    res.json({ success: true, message: 'Booking cancelled' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /bookings/:id/transfer
exports.transfer = asyncHandler(async (req, res) => {
  const { target_email, ticket_ids } = req.body;
  // Ticket transfer logic - simplified
  res.json({ success: true, message: 'Transfer initiated', data: { target_email, ticket_ids } });
});
