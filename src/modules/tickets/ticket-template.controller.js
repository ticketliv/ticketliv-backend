const { query } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');

// GET /ticket-templates — List all templates for an organizer
exports.getAll = asyncHandler(async (req, res) => {
  const { organizer_id } = req.query;
  const where = organizer_id 
    ? 'WHERE organizer_id = $1 OR organizer_id IS NULL' 
    : 'WHERE organizer_id IS NULL';
  const params = organizer_id ? [organizer_id] : [];

  const result = await query(`
    SELECT * FROM ticket_templates ${where} ORDER BY created_at DESC
  `, params);

  res.json({ success: true, data: result.rows });
});

// POST /ticket-templates — Create a new template
exports.create = asyncHandler(async (req, res) => {
  const { name, template_type, design_config, is_default, organizer_id } = req.body;
  const id = uuidv4();

  // If is_default, unset previous default for this organizer/type
  if (is_default) {
    await query('UPDATE ticket_templates SET is_default = false WHERE organizer_id = $1 AND template_type = $2', [organizer_id, template_type]);
  }

  const result = await query(`
    INSERT INTO ticket_templates (id, organizer_id, name, template_type, design_config, is_default)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [id, organizer_id, name, template_type || 'classic', JSON.stringify(design_config || {}), is_default || false]);

  res.status(201).json({ success: true, data: result.rows[0] });
});

// GET /ticket-templates/:id
exports.getById = asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM ticket_templates WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) throw new AppError('Template not found', 404);
  res.json({ success: true, data: result.rows[0] });
});

// PUT /ticket-templates/:id
exports.update = asyncHandler(async (req, res) => {
  const { name, design_config, is_default } = req.body;
  const { id } = req.params;

  const result = await query(`
    UPDATE ticket_templates SET
      name = COALESCE($1, name),
      design_config = COALESCE($2, design_config),
      is_default = COALESCE($3, is_default),
      version = version + 1,
      updated_at = NOW()
    WHERE id = $4
    RETURNING *
  `, [name, design_config ? JSON.stringify(design_config) : null, is_default, id]);

  if (result.rows.length === 0) throw new AppError('Template not found', 404);
  res.json({ success: true, data: result.rows[0] });
});

// DELETE /ticket-templates/:id
exports.remove = asyncHandler(async (req, res) => {
  await query('DELETE FROM ticket_templates WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: 'Template deleted' });
});
