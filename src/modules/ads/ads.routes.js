const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { query } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

// GET /ads
router.get('/', asyncHandler(async (req, res) => {
  const { placement, status } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  let idx = 1;
  if (placement) { where += ` AND placement = $${idx}`; params.push(placement); idx++; }
  if (status) { where += ` AND status = $${idx}`; params.push(status); idx++; }

  const result = await query(`SELECT * FROM ads ${where} ORDER BY created_at DESC`, params);
  res.json({ success: true, data: result.rows });
}));

// POST /ads
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { title, type, media_url, video_url, target_url, placement, status, start_date, end_date } = req.body;
  const id = uuidv4();
  const result = await query(
    `INSERT INTO ads (id, title, type, media_url, video_url, target_url, placement, status, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [id, title, type || 'banner', media_url, video_url, target_url, placement || 'home', status || 'Active', start_date, end_date]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

// PUT /ads/:id
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const { title, type, media_url, video_url, target_url, placement, status } = req.body;
  const result = await query(
    `UPDATE ads SET title = $1, type = $2, 
     media_url = $3, video_url = $4,
     target_url = $5, placement = $6, status = $7
     WHERE id = $8 RETURNING *`,
    [title, type, media_url, video_url, target_url, placement, status, req.params.id]
  );
  res.json({ success: true, data: result.rows[0] });
}));

// DELETE /ads/:id
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  await query('DELETE FROM ads WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: 'Ad deleted' });
}));

// POST /ads/:id/click (track click)
router.post('/:id/click', asyncHandler(async (req, res) => {
  await query('UPDATE ads SET clicks = clicks + 1 WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// POST /ads/:id/impression (track impression)
router.post('/:id/impression', asyncHandler(async (req, res) => {
  await query('UPDATE ads SET impressions = impressions + 1 WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

module.exports = router;
