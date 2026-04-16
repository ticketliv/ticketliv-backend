const { query, getClient } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const { cache } = require('../../config/redis');
const { v4: uuidv4 } = require('uuid');
const { formatDateOnly, formatTimeOnly } = require('../../utils/dateUtils');

/**
 * Shared helper to map database event records to the format expected by clients (Mobile & Admin).
 * Ensures consistency across all endpoints.
 */
const mapEvent = (e) => {
  if (!e) return null;
  
  return {
    ...e,
    ticketCategories: e.ticket_categories || [],
    categoryIds: e.category_ids || [],
    sales: e.total_sales || 0,
    revenue: parseFloat(e.total_revenue || 0),
    revenueCurrency: e.revenue_currency || 'INR',
    date: formatDateOnly(e.start_date), // Format to YYYY-MM-DD
    start_date: formatDateOnly(e.start_date), 
    end_date: formatDateOnly(e.end_date),
    time: formatTimeOnly(e.start_date),
    location: e.venue_name || '',
    publishingStatus: e.publishing_status,
    timezone: e.timezone || 'Asia/Kolkata',
    latitude: parseFloat(e.latitude) || null,
    longitude: parseFloat(e.longitude) || null,
    organizerId: e.organizer_id,
    more_info: e.more_info || [],
    sponsors: e.sponsors || [],
    financials: e.financials || {},
    gates: e.gates || [],
    mainMedia: e.main_media || [],
    layoutMedia: e.layout_media || []
  };
};

// GET /events
exports.getAll = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, category, status, sort = 'created_at', order = 'DESC' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (status) { whereClause += ` AND e.status = $${paramIndex++}`; params.push(status); }
  if (category) { whereClause += ` AND ec.category_id = $${paramIndex++}`; params.push(category); }

  const allowedSorts = ['created_at', 'start_date', 'total_sales', 'title'];
  const sortCol = allowedSorts.includes(sort) ? sort : 'created_at';
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const countResult = await query(
    `SELECT COUNT(DISTINCT e.id) FROM events e LEFT JOIN event_categories ec ON e.id = ec.event_id ${whereClause}`, params
  );
  const total = parseInt(countResult.rows[0].count);

  params.push(parseInt(limit), offset);

  const result = await query(`
    SELECT e.*, 
      COALESCE(json_agg(DISTINCT jsonb_build_object('id', tt.id, 'name', tt.name, 'price', tt.price, 'capacity', tt.capacity, 'sold_count', tt.sold_count, 'max_per_user', tt.max_per_user)) FILTER (WHERE tt.id IS NOT NULL), '[]') as ticket_categories,
      COALESCE(array_agg(DISTINCT ec.category_id) FILTER (WHERE ec.category_id IS NOT NULL), '{}') as category_ids
    FROM events e
    LEFT JOIN ticket_types tt ON e.id = tt.event_id
    LEFT JOIN event_categories ec ON e.id = ec.event_id
    ${whereClause}
    GROUP BY e.id
    ORDER BY e.${sortCol} ${sortOrder}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, params);

  const events = result.rows.map(mapEvent);

  res.json({ success: true, data: events, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
});

// GET /events/featured
exports.getFeatured = asyncHandler(async (req, res) => {
  const cached = await cache.get('events:featured');
  if (cached) return res.json({ success: true, data: cached });

  const result = await query(`
    SELECT e.*, 
      COALESCE(json_agg(DISTINCT jsonb_build_object('id', tt.id, 'name', tt.name, 'price', tt.price, 'capacity', tt.capacity, 'sold_count', tt.sold_count)) FILTER (WHERE tt.id IS NOT NULL), '[]') as ticket_categories
    FROM events e
    LEFT JOIN ticket_types tt ON e.id = tt.event_id
    WHERE e.status = 'Live' AND e.publishing_status = 'Published' AND (e.is_featured = true OR e.is_popular = true)
    GROUP BY e.id
    ORDER BY e.is_featured DESC, e.total_sales DESC
    LIMIT 20
  `);

  const events = result.rows.map(mapEvent);
  await cache.set('events:featured', events, 300);
  res.json({ success: true, data: events });
});

// GET /events/popular
exports.getPopular = asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT e.*, MIN(tt.price) as price
    FROM events e
    LEFT JOIN ticket_types tt ON e.id = tt.event_id
    WHERE e.status = 'Live' AND e.publishing_status = 'Published'
    GROUP BY e.id
    ORDER BY e.total_sales DESC
    LIMIT 20
  `);
  
  const events = result.rows.map(mapEvent);
  res.json({ success: true, data: events });
});

// GET /events/categorized
exports.getCategorized = asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT 
      c.name as category_name,
      json_agg(json_build_object(
        'id', e.id,
        'title', e.title,
        'image_url', e.image_url,
        'price', (SELECT MIN(price) FROM ticket_types WHERE event_id = e.id),
        'location', e.venue_name,
        'date', e.start_date
      )) as events
    FROM categories c
    JOIN event_categories ec ON c.id = ec.category_id
    JOIN events e ON ec.event_id = e.id
    WHERE e.status = 'Live' AND e.publishing_status = 'Published'
    GROUP BY c.id, c.name
    ORDER BY c.name ASC
  `);

  // Transform into a simple object { CATEGORY: [events] }
  const categorized = {};
  result.rows.forEach(row => {
    categorized[row.category_name] = row.events.slice(0, 10) || [];
  });

  res.json({ success: true, data: categorized });
});

// GET /events/search
exports.search = asyncHandler(async (req, res) => {
  const { q, category: _category, location: _location, date_from, date_to, min_price: _min_price, max_price: _max_price, limit = 20 } = req.query;
  
  let whereClause = "WHERE e.status = 'Live' AND e.publishing_status = 'Published'";
  const params = [];
  let paramIndex = 1;

  if (q) {
    whereClause += ` AND (e.title ILIKE $${paramIndex} OR e.description ILIKE $${paramIndex} OR e.venue_name ILIKE $${paramIndex})`;
    params.push(`%${q}%`); paramIndex++;
  }
  if (date_from) { whereClause += ` AND e.start_date >= $${paramIndex++}`; params.push(date_from); }
  if (date_to) { whereClause += ` AND e.start_date <= $${paramIndex++}`; params.push(date_to); }

  params.push(parseInt(limit));

  const result = await query(`
    SELECT e.*, 
      COALESCE(MIN(tt.price), 0) as min_price,
      COALESCE(array_agg(DISTINCT ec.category_id) FILTER (WHERE ec.category_id IS NOT NULL), '{}') as category_ids
    FROM events e
    LEFT JOIN ticket_types tt ON e.id = tt.event_id
    LEFT JOIN event_categories ec ON e.id = ec.event_id
    ${whereClause}
    GROUP BY e.id
    ORDER BY e.is_featured DESC, e.start_date ASC
    LIMIT $${paramIndex}
  `, params);

  const events = result.rows.map(mapEvent);
  res.json({ success: true, data: events });
});

// GET /events/:id
exports.getById = asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT e.*, 
      COALESCE(json_agg(DISTINCT jsonb_build_object('id', tt.id, 'name', tt.name, 'price', tt.price, 'capacity', tt.capacity, 'sold_count', tt.sold_count, 'max_per_user', tt.max_per_user, 'type', tt.type)) FILTER (WHERE tt.id IS NOT NULL), '[]') as ticket_categories,
      COALESCE(array_agg(DISTINCT ec.category_id) FILTER (WHERE ec.category_id IS NOT NULL), '{}') as category_ids
    FROM events e
    LEFT JOIN ticket_types tt ON e.id = tt.event_id
    LEFT JOIN event_categories ec ON e.id = ec.event_id
    WHERE e.id = $1
    GROUP BY e.id
  `, [req.params.id]);

  if (result.rows.length === 0) throw new AppError('Event not found', 404);

  const event = mapEvent(result.rows[0]);
  res.json({ success: true, data: event });
});

// POST /events
exports.create = asyncHandler(async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const eventData = req.body;
    const eventId = uuidv4();

    await client.query(`
      INSERT INTO events (id, title, description, start_date, end_date, venue_name, venue_address, map_url,
        status, image_url, video_url, layout_image, gallery, tags, terms, more_info, extra_info,
        financials, prohibited_items, refund_policy, entry_policy, support_email, support_phone,
        sponsors, field_config, gates, main_media, layout_media, is_featured, is_popular, presenter_name, organizer_name, revenue_currency)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
    `, [
      eventId, eventData.title, eventData.description, eventData.date || eventData.start_date, eventData.end_date,
      eventData.location || eventData.venue_name, eventData.venue_address, eventData.map_url,
      eventData.status || 'Live', eventData.image_url, eventData.video_url, eventData.layout_image,
      JSON.stringify(eventData.gallery || []), JSON.stringify(eventData.tags || []),
      JSON.stringify(eventData.terms || []), JSON.stringify(eventData.more_info || []),
      JSON.stringify(eventData.extra_info || {}), JSON.stringify(eventData.financials || {}),
      JSON.stringify(eventData.prohibited_items || []), eventData.refund_policy, eventData.entry_policy,
      eventData.support_email, eventData.support_phone, JSON.stringify(eventData.sponsors || []),
      JSON.stringify(eventData.field_config || {}), JSON.stringify(eventData.gates || []),
      JSON.stringify(eventData.mainMedia || []), JSON.stringify(eventData.layoutMedia || []),
      eventData.is_featured || false, eventData.is_popular || false,
      eventData.presenter_name, eventData.organizer_name, eventData.revenueCurrency || 'INR'
    ]);

    // Insert ticket categories
    const ticketCategories = eventData.ticketCategories || [];
    for (const tc of ticketCategories) {
      await client.query(
        'INSERT INTO ticket_types (event_id, name, price, capacity, max_per_user, type) VALUES ($1, $2, $3, $4, $5, $6)',
        [eventId, tc.name, tc.price || 0, tc.capacity || 0, tc.max_limit || tc.max_per_user || 10, tc.type || 'General']
      );
    }

    // Insert event-category mappings
    const categoryIds = eventData.categoryIds || [];
    for (const catId of categoryIds) {
      await client.query(
        'INSERT INTO event_categories (event_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [eventId, catId]
      );
    }

    await client.query('COMMIT');

    // Fetch the complete event
    const result = await query(`
      SELECT e.*, 
        COALESCE(json_agg(DISTINCT jsonb_build_object('id', tt.id, 'name', tt.name, 'price', tt.price, 'capacity', tt.capacity, 'sold_count', tt.sold_count)) FILTER (WHERE tt.id IS NOT NULL), '[]') as ticket_categories,
        COALESCE(array_agg(DISTINCT ec.category_id) FILTER (WHERE ec.category_id IS NOT NULL), '{}') as category_ids
      FROM events e LEFT JOIN ticket_types tt ON e.id = tt.event_id
      LEFT JOIN event_categories ec ON e.id = ec.event_id
      WHERE e.id = $1 GROUP BY e.id
    `, [eventId]);

    const event = mapEvent(result.rows[0]);

    await cache.del('events:featured');
    res.status(201).json({ success: true, data: event });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PUT /events/:id
exports.update = asyncHandler(async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const eventData = req.body;
    await client.query(`
      UPDATE events SET
        title = $1, description = $2, start_date = $3, end_date = $4,
        venue_name = $5, venue_address = $6, map_url = $7, status = $8,
        image_url = $9, video_url = $10, layout_image = $11, gallery = $12,
        tags = $13, terms = $14, more_info = $15, extra_info = $16,
        financials = $17, prohibited_items = $18, refund_policy = $19,
        entry_policy = $20, support_email = $21, support_phone = $22,
        sponsors = $23, field_config = $24, gates = $25, main_media = $26, 
        layout_media = $27, is_featured = $28, is_popular = $29, presenter_name = $30, 
        organizer_name = $31, revenue_currency = $32, updated_at = NOW()
      WHERE id = $33
    `, [
      eventData.title, eventData.description, eventData.date || eventData.start_date, eventData.end_date,
      eventData.location || eventData.venue_name, eventData.venue_address, eventData.map_url, eventData.status,
      eventData.image_url, eventData.video_url, eventData.layout_image, JSON.stringify(eventData.gallery || []),
      JSON.stringify(eventData.tags || []), JSON.stringify(eventData.terms || []),
      JSON.stringify(eventData.more_info || []), JSON.stringify(eventData.extra_info || {}),
      JSON.stringify(eventData.financials || {}), JSON.stringify(eventData.prohibited_items || []),
      eventData.refund_policy, eventData.entry_policy, eventData.support_email, eventData.support_phone,
      JSON.stringify(eventData.sponsors || []), JSON.stringify(eventData.field_config || {}),
      JSON.stringify(eventData.gates || []), JSON.stringify(eventData.mainMedia || []), JSON.stringify(eventData.layoutMedia || []),
      eventData.is_featured || false, eventData.is_popular || false,
      eventData.presenter_name, eventData.organizer_name, eventData.revenueCurrency || 'INR',
      id
    ]);

    // Update ticket types if provided
    if (eventData.ticketCategories) {
      await client.query('DELETE FROM ticket_types WHERE event_id = $1', [id]);
      for (const tc of eventData.ticketCategories) {
        await client.query(
          'INSERT INTO ticket_types (event_id, name, price, capacity, max_per_user, type) VALUES ($1, $2, $3, $4, $5, $6)',
          [id, tc.name, tc.price || 0, tc.capacity || 0, tc.max_limit || tc.max_per_user || 10, tc.type || 'General']
        );
      }
    }

    // Update category mappings if provided
    if (eventData.categoryIds) {
      await client.query('DELETE FROM event_categories WHERE event_id = $1', [id]);
      for (const catId of eventData.categoryIds) {
        await client.query('INSERT INTO event_categories (event_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, catId]);
      }
    }

    await client.query('COMMIT');

    // Re-fetch
    const result = await query(`
      SELECT e.*, 
        COALESCE(json_agg(DISTINCT jsonb_build_object('id', tt.id, 'name', tt.name, 'price', tt.price, 'capacity', tt.capacity, 'sold_count', tt.sold_count)) FILTER (WHERE tt.id IS NOT NULL), '[]') as ticket_categories,
        COALESCE(array_agg(DISTINCT ec.category_id) FILTER (WHERE ec.category_id IS NOT NULL), '{}') as category_ids
      FROM events e LEFT JOIN ticket_types tt ON e.id = tt.event_id
      LEFT JOIN event_categories ec ON e.id = ec.event_id
      WHERE e.id = $1 GROUP BY e.id
    `, [id]);

    if (result.rows.length === 0) throw new AppError('Event not found', 404);
    
    const event = mapEvent(result.rows[0]);

    await cache.del('events:featured');
    res.json({ success: true, data: event });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// DELETE /events/:id
exports.remove = asyncHandler(async (req, res) => {
  await query('DELETE FROM events WHERE id = $1', [req.params.id]);
  await cache.del('events:featured');
  res.json({ success: true, message: 'Event deleted' });
});

// PATCH /events/:id/status
exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const result = await query('UPDATE events SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [status, req.params.id]);
  if (result.rows.length === 0) throw new AppError('Event not found', 404);
  res.json({ success: true, data: result.rows[0] });
});
