const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { query } = require('../../config/database');
const recService = require('../analytics/recommendation.service');

// GET /users - Get all app users
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT id, full_name, email, phone, role, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 100'
  );
  res.json({ success: true, data: result.rows });
}));

// GET /users/recommendations
router.get('/recommendations', authenticate, asyncHandler(async (req, res) => {
  const recommendations = await recService.getPersonalizedEvents(req.user.id);
  res.json({ success: true, data: recommendations });
}));

// GET /users/:id
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const result = await query('SELECT id, full_name, email, phone, role, avatar_url, preferences, created_at FROM users WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, data: result.rows[0] });
}));

// PUT /users/:id
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const { full_name, phone, avatar_url, preferences } = req.body;
  const result = await query(
    `UPDATE users SET full_name = COALESCE($1, full_name), phone = COALESCE($2, phone), 
     avatar_url = COALESCE($3, avatar_url), preferences = COALESCE($4, preferences), updated_at = NOW()
     WHERE id = $5 RETURNING id, full_name, email, phone, avatar_url, preferences`,
    [full_name, phone, avatar_url, preferences ? JSON.stringify(preferences) : null, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, data: result.rows[0] });
}));

module.exports = router;
