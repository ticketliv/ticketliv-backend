const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { query } = require('../../config/database');

// GET /analytics/dashboard
router.get('/dashboard', authenticate, asyncHandler(async (req, res) => {
  const [revenue, events, bookings, users] = await Promise.all([
    query("SELECT COALESCE(SUM(total_amount), 0) as total_revenue, COUNT(*) as total_bookings FROM bookings WHERE status = 'confirmed'"),
    query("SELECT COUNT(*) as total_events, COUNT(*) FILTER (WHERE status = 'Live') as live_events FROM events"),
    query("SELECT COUNT(*) as today_bookings FROM bookings WHERE created_at >= CURRENT_DATE"),
    query("SELECT COUNT(*) as total_users FROM users"),
  ]);

  res.json({
    success: true,
    data: {
      totalRevenue: parseFloat(revenue.rows[0].total_revenue),
      totalBookings: parseInt(revenue.rows[0].total_bookings),
      totalEvents: parseInt(events.rows[0].total_events),
      liveEvents: parseInt(events.rows[0].live_events),
      todayBookings: parseInt(bookings.rows[0].today_bookings),
      totalUsers: parseInt(users.rows[0].total_users),
    }
  });
}));

// GET /analytics/revenue
router.get('/revenue', authenticate, asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query;
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  const result = await query(`
    SELECT DATE(created_at) as date, SUM(total_amount) as revenue, COUNT(*) as bookings
    FROM bookings WHERE status = 'confirmed' AND created_at >= NOW() - INTERVAL '${days} days'
    GROUP BY DATE(created_at) ORDER BY date
  `);

  res.json({ success: true, data: result.rows });
}));

// GET /analytics/events
router.get('/events', authenticate, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT e.id, e.title, e.status, e.total_sales, e.total_revenue,
      COUNT(DISTINCT b.id) as booking_count,
      COUNT(DISTINCT t.id) FILTER (WHERE t.scan_status = 'scanned') as scanned_count,
      COUNT(DISTINCT t.id) as ticket_count
    FROM events e
    LEFT JOIN bookings b ON e.id = b.event_id AND b.status = 'confirmed'
    LEFT JOIN tickets t ON e.id = t.event_id
    GROUP BY e.id
    ORDER BY e.total_revenue DESC
    LIMIT 20
  `);
  res.json({ success: true, data: result.rows });
}));

// GET /analytics/categories
router.get('/categories', authenticate, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT c.name, c.color, COUNT(DISTINCT ec.event_id) as event_count,
      COALESCE(SUM(e.total_revenue), 0) as total_revenue
    FROM categories c
    LEFT JOIN event_categories ec ON c.id = ec.category_id
    LEFT JOIN events e ON ec.event_id = e.id
    GROUP BY c.id ORDER BY total_revenue DESC
  `);
  res.json({ success: true, data: result.rows });
}));

// GET /analytics/transactions
router.get('/transactions', authenticate, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT p.id, p.transaction_id, p.amount, p.currency, p.status, p.payment_method, p.created_at,
      b.booking_ref, e.title as event_title
    FROM payments p
    LEFT JOIN bookings b ON p.booking_id = b.id
    LEFT JOIN events e ON b.event_id = e.id
    ORDER BY p.created_at DESC LIMIT 100
  `);

  const mapped = result.rows.map(r => ({
    id: r.id,
    to: r.event_title || 'Unknown',
    amount: `₹${parseFloat(r.amount).toLocaleString()}`,
    date: r.created_at,
    type: r.payment_method || 'UPI',
    status: r.status === 'success' ? 'Completed' : r.status,
  }));

  res.json({ success: true, data: mapped });
}));

module.exports = router;
