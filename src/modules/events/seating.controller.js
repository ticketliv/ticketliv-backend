const { query, getClient } = require('../../config/database');
const { asyncHandler } = require('../../middleware/errorHandler');

/**
 * Seat Layout Service
 * Handles complex venue modeling and bulk seat generation
 */
exports.createSectionWithSeats = asyncHandler(async (req, res) => {
  const { layout_id, name, level_name, rows_config, section_type, path_data } = req.body;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Create Section
    const sectionResult = await client.query(`
      INSERT INTO sections (layout_id, name, level_name, section_type, path_data)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [layout_id, name, level_name, section_type || 'Reserved', path_data]);

    const sectionId = sectionResult.rows[0].id;

    // 2. Bulk Generate Seats (Req: Bulk Generation)
    if (section_type !== 'GeneralAdmission' && rows_config) {
      for (const row of rows_config) {
        const { label, count, start_x, start_y, spacing_x = 30, spacing_y = 0 } = row;
        
        for (let i = 1; i <= count; i++) {
          await client.query(`
            INSERT INTO seats (section_id, row_label, seat_number, x_pos, y_pos)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            sectionId, 
            label, 
            i.toString(), 
            start_x + (i - 1) * spacing_x, 
            start_y + (i - 1) * spacing_y
          ]);
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, sectionId });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

/**
 * Get Full Venue Layout for Rendering
 * Optimized for performance using Section-based grouping
 */
exports.getVenueLayout = asyncHandler(async (req, res) => {
  const { layout_id } = req.params;

  const result = await query(`
    SELECT 
      s.id as section_id, s.name as section_name, s.level_name, s.section_type, s.path_data,
      json_agg(jsonb_build_object(
        'id', st.id, 
        'r', st.row_label, 
        'n', st.seat_number, 
        'x', st.x_pos, 
        'y', st.y_pos, 
        't', st.seat_type, 
        's', st.status
      )) as seats
    FROM sections s
    LEFT JOIN seats st ON s.id = st.section_id
    WHERE s.layout_id = $1
    GROUP BY s.id
  `, [layout_id]);

  res.json({ success: true, data: result.rows });
});
