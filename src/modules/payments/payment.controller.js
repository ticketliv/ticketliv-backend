const { query, getClient } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');
const _crypto = require('crypto'); // reserved for webhook signature verification

// POST /payments/initiate
exports.initiate = asyncHandler(async (req, res) => {
  const { booking_id, payment_method, return_url: _return_url } = req.body;

  // Get booking
  const bookingResult = await query('SELECT * FROM bookings WHERE id = $1', [booking_id]);
  if (bookingResult.rows.length === 0) throw new AppError('Booking not found', 404);
  const booking = bookingResult.rows[0];

  const merchantTransactionId = `MTX-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  // Create payment record
  const paymentId = uuidv4();
  await query(
    `INSERT INTO payments (id, booking_id, transaction_id, merchant_transaction_id, payment_method, amount, currency, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
    [paymentId, booking_id, merchantTransactionId, merchantTransactionId, payment_method || 'UPI', booking.total_amount, booking.currency || 'INR']
  );

  // In production: call PhonePe API to create payment order
  // Return secure payment gateway URL
  const paymentData = {
    paymentId,
    merchantTransactionId,
    amount: parseFloat(booking.total_amount),
    currency: booking.currency || 'INR',
    paymentUrl: `https://payment.ticketliv.com/pay/${merchantTransactionId}`,
    status: 'pending',
  };

  res.json({ success: true, data: paymentData });
});

// POST /payments/verify/:transactionId
exports.verify = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;

  // Get payment
  const paymentResult = await query('SELECT * FROM payments WHERE transaction_id = $1', [transactionId]);
  if (paymentResult.rows.length === 0) throw new AppError('Payment not found', 404);

  const payment = paymentResult.rows[0];

  // In production: verify with PhonePe API
  // For development: simulate successful payment
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Update payment status
    await client.query("UPDATE payments SET status = 'success', updated_at = NOW() WHERE id = $1", [payment.id]);

    // Confirm booking
    await client.query("UPDATE bookings SET status = 'confirmed', updated_at = NOW() WHERE id = $1", [payment.booking_id]);

    // Generate tickets for the booking
    const booking = (await client.query('SELECT * FROM bookings WHERE id = $1', [payment.booking_id])).rows[0];
    
    // Get ticket types for this booking's event
    const _ticketTypes = (await client.query('SELECT * FROM ticket_types WHERE event_id = $1', [booking.event_id])).rows;

    // Update event sales
    await client.query(
      'UPDATE events SET total_sales = total_sales + 1, total_revenue = total_revenue + $1 WHERE id = $2',
      [payment.amount, booking.event_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        status: 'SUCCESS',
        bookingId: payment.booking_id,
        transactionId,
        amount: payment.amount,
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /payments/webhook (called by PhonePe/Stripe)
exports.webhook = asyncHandler(async (req, res) => {
  const { merchantTransactionId, status, code } = req.body;

  // In production: verify webhook signature
  if (merchantTransactionId) {
    const newStatus = (code === 'PAYMENT_SUCCESS' || status === 'success') ? 'success' : 'failed';
    await query("UPDATE payments SET status = $1, gateway_response = $2, updated_at = NOW() WHERE merchant_transaction_id = $3",
      [newStatus, JSON.stringify(req.body), merchantTransactionId]);
    
    if (newStatus === 'success') {
      const payment = (await query('SELECT * FROM payments WHERE merchant_transaction_id = $1', [merchantTransactionId])).rows[0];
      if (payment) {
        await query("UPDATE bookings SET status = 'confirmed', updated_at = NOW() WHERE id = $1", [payment.booking_id]);
      }
    }
  }

  res.json({ success: true });
});

// GET /payments/:id
exports.getById = asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM payments WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) throw new AppError('Payment not found', 404);
  res.json({ success: true, data: result.rows[0] });
});

// POST /payments/refund
exports.refund = asyncHandler(async (req, res) => {
  const { payment_id, amount, reason } = req.body;

  const paymentResult = await query('SELECT * FROM payments WHERE id = $1', [payment_id]);
  if (paymentResult.rows.length === 0) throw new AppError('Payment not found', 404);

  const refundId = uuidv4();
  await query(
    `INSERT INTO refunds (id, payment_id, booking_id, amount, reason, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')`,
    [refundId, payment_id, paymentResult.rows[0].booking_id, amount, reason]
  );

  // In production: call payment gateway refund API
  await query("UPDATE refunds SET status = 'processed', processed_at = NOW() WHERE id = $1", [refundId]);
  await query("UPDATE payments SET status = 'refunded', updated_at = NOW() WHERE id = $1", [payment_id]);

  res.json({ success: true, data: { refundId, amount, status: 'processed' } });
});
