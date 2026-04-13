const { query } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const { cache } = require('../../config/redis');

// GET /categories
exports.getAll = asyncHandler(async (req, res) => {
  // Try cache first
  const cached = await cache.get('categories:all');
  if (cached) return res.json({ success: true, data: cached });

  const result = await query(`
    SELECT c.*, COUNT(ec.event_id)::INTEGER as event_count 
    FROM categories c 
    LEFT JOIN event_categories ec ON c.id = ec.category_id 
    GROUP BY c.id 
    ORDER BY c.name ASC
  `);

  await cache.set('categories:all', result.rows, 3600);
  res.json({ success: true, data: result.rows });
});

// GET /categories/:id
exports.getById = asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) throw new AppError('Category not found', 404);
  res.json({ success: true, data: result.rows[0] });
});

// POST /categories
exports.create = asyncHandler(async (req, res) => {
  const { name, icon_name, iconName, color, status } = req.body;
  const finalIconName = icon_name || iconName || 'Sparkles';

  const result = await query(
    'INSERT INTO categories (name, icon_name, color, status) VALUES ($1, $2, $3, $4) RETURNING *',
    [name.toUpperCase().trim(), finalIconName, color || 'indigo', status || 'Active']
  );

  await cache.del('categories:all');
  res.status(201).json({ success: true, data: result.rows[0] });
});

// PUT /categories/:id
exports.update = asyncHandler(async (req, res) => {
  const { name, icon_name, iconName, color, status } = req.body;
  const finalIconName = icon_name || iconName;

  const result = await query(
    `UPDATE categories SET 
      name = COALESCE($1, name), icon_name = COALESCE($2, icon_name), 
      color = COALESCE($3, color), status = COALESCE($4, status)
     WHERE id = $5 RETURNING *`,
    [name ? name.toUpperCase() : null, finalIconName, color, status, req.params.id]
  );

  if (result.rows.length === 0) throw new AppError('Category not found', 404);
  await cache.del('categories:all');
  res.json({ success: true, data: result.rows[0] });
});

// DELETE /categories/:id
exports.remove = asyncHandler(async (req, res) => {
  await query('DELETE FROM categories WHERE id = $1', [req.params.id]);
  await cache.del('categories:all');
  res.json({ success: true, message: 'Category deleted' });
});
