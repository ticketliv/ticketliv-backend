const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { query } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

// GET /notifications
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  res.json({ success: true, data: result.rows });
}));

// PATCH /notifications/:id/read
router.patch('/:id/read', authenticate, asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ success: true, message: 'Marked as read' });
}));

// POST /notifications (admin: send to user)
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { user_id, title, body, type, data } = req.body;
  const id = uuidv4();
  await query(
    'INSERT INTO notifications (id, user_id, title, body, type, data) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, user_id, title, body, type || 'info', JSON.stringify(data || {})]
  );
  res.status(201).json({ success: true, data: { id } });
}));

// POST /notifications/push (bulk push)
router.post('/push', authenticate, asyncHandler(async (req, res) => {
  const { title, body: _body, target } = req.body;
  // In production: send via Firebase Cloud Messaging
  res.json({ success: true, message: 'Push notification queued', data: { title, target } });
}));

// PATCH /notifications/read-all
router.patch('/read-all', authenticate, asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
  res.json({ success: true, message: 'All notifications marked as read' });
}));

// GET /notifications/unread-count
router.get('/unread-count', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
    [req.user.id]
  );
  res.json({ success: true, count: parseInt(result.rows[0].count) });
}));

module.exports = router;
