const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const { query } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

// === COUPONS ===

// GET /marketing/coupons
router.get('/coupons', authenticate, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM coupons ORDER BY created_at DESC');
  res.json({ success: true, data: result.rows });
}));

// POST /marketing/coupons
router.post('/coupons', authenticate, asyncHandler(async (req, res) => {
  const { code, discount_type, discountType, discount_value, discountValue, min_purchase, minPurchase, max_discount, maxDiscount, expiry_date, expiryDate, usage_limit, usageLimit, status, applicable_event_ids, applicableEventIds } = req.body;
  const id = uuidv4();
  const result = await query(
    `INSERT INTO coupons (id, code, discount_type, discount_value, min_purchase, max_discount, expiry_date, usage_limit, status, applicable_event_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [id, (code || '').toUpperCase(), discount_type || discountType, discount_value || discountValue || 0, 
     min_purchase || minPurchase || 0, max_discount || maxDiscount || null, expiry_date || expiryDate,
     usage_limit || usageLimit || 0, status || 'Active', JSON.stringify(applicable_event_ids || applicableEventIds || [])]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

// PUT /marketing/coupons/:id
router.put('/coupons/:id', authenticate, asyncHandler(async (req, res) => {
  const { code, discount_type, discountType, discount_value, discountValue, min_purchase, minPurchase, max_discount, maxDiscount, expiry_date, expiryDate, usage_limit, usageLimit, status } = req.body;
  const result = await query(
    `UPDATE coupons SET 
      code = COALESCE($1, code), discount_type = COALESCE($2, discount_type),
      discount_value = COALESCE($3, discount_value), min_purchase = COALESCE($4, min_purchase),
      max_discount = COALESCE($5, max_discount), expiry_date = COALESCE($6, expiry_date),
      usage_limit = COALESCE($7, usage_limit), status = COALESCE($8, status)
     WHERE id = $9 RETURNING *`,
    [(code || '').toUpperCase() || null, discount_type || discountType, discount_value || discountValue,
     min_purchase || minPurchase, max_discount || maxDiscount, expiry_date || expiryDate,
     usage_limit || usageLimit, status, req.params.id]
  );
  if (result.rows.length === 0) throw new AppError('Coupon not found', 404);
  res.json({ success: true, data: result.rows[0] });
}));

// DELETE /marketing/coupons/:id
router.delete('/coupons/:id', authenticate, asyncHandler(async (req, res) => {
  await query('DELETE FROM coupons WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: 'Coupon deleted' });
}));

// POST /marketing/coupons/validate
router.post('/coupons/validate', asyncHandler(async (req, res) => {
  const { code, amount, event_id: _event_id } = req.body;
  const result = await query(
    "SELECT * FROM coupons WHERE code = $1 AND status = 'Active' AND (expiry_date IS NULL OR expiry_date > NOW())",
    [(code || '').toUpperCase()]
  );
  if (result.rows.length === 0) return res.json({ success: false, message: 'Invalid or expired coupon' });

  const coupon = result.rows[0];
  if (coupon.usage_limit > 0 && coupon.used_count >= coupon.usage_limit) {
    return res.json({ success: false, message: 'Coupon usage limit reached' });
  }
  if (amount < parseFloat(coupon.min_purchase || 0)) {
    return res.json({ success: false, message: `Minimum purchase ₹${coupon.min_purchase} required` });
  }

  let discount;
  if (coupon.discount_type === 'Percentage') {
    discount = (amount * parseFloat(coupon.discount_value)) / 100;
    if (coupon.max_discount) discount = Math.min(discount, parseFloat(coupon.max_discount));
  } else {
    discount = parseFloat(coupon.discount_value);
  }

  res.json({ success: true, data: { coupon, discount, finalAmount: amount - discount } });
}));

// === DISCOUNTS ===

// GET /marketing/discounts
router.get('/discounts', authenticate, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM discounts ORDER BY created_at DESC');
  res.json({ success: true, data: result.rows });
}));

// POST /marketing/discounts
router.post('/discounts', authenticate, asyncHandler(async (req, res) => {
  const { name, discount_type, discountType, discount_value, discountValue, rule_type, ruleType, rule_value, ruleValue, status, applicable_event_ids, applicableEventIds } = req.body;
  const id = uuidv4();
  const result = await query(
    `INSERT INTO discounts (id, name, discount_type, discount_value, rule_type, rule_value, status, applicable_event_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [id, (name || '').toUpperCase(), discount_type || discountType, discount_value || discountValue || 0,
     rule_type || ruleType, rule_value || ruleValue, status || 'Active',
     JSON.stringify(applicable_event_ids || applicableEventIds || [])]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

// PUT /marketing/discounts/:id
router.put('/discounts/:id', authenticate, asyncHandler(async (req, res) => {
  const { name, discount_type, discountType, discount_value, discountValue, rule_type, ruleType, rule_value, ruleValue, status } = req.body;
  const result = await query(
    `UPDATE discounts SET 
      name = COALESCE($1, name), discount_type = COALESCE($2, discount_type),
      discount_value = COALESCE($3, discount_value), rule_type = COALESCE($4, rule_type),
      rule_value = COALESCE($5, rule_value), status = COALESCE($6, status)
     WHERE id = $7 RETURNING *`,
    [(name || '').toUpperCase() || null, discount_type || discountType, discount_value || discountValue,
     rule_type || ruleType, rule_value || ruleValue, status, req.params.id]
  );
  if (result.rows.length === 0) throw new AppError('Discount not found', 404);
  res.json({ success: true, data: result.rows[0] });
}));

// DELETE /marketing/discounts/:id
router.delete('/discounts/:id', authenticate, asyncHandler(async (req, res) => {
  await query('DELETE FROM discounts WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: 'Discount deleted' });
}));

module.exports = router;
