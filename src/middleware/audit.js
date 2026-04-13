const { query } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Audit Service
 * Tracks all administrative and critical organizer actions
 */
const logAction = async (userId, action, entityType, entityId, oldData = null, newData = null, req = null) => {
  try {
    const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || null;
    
    await query(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_data, new_data, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      uuidv4(), 
      userId, 
      action, 
      entityType, 
      entityId, 
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      ipAddress
    ]);
  } catch (err) {
    console.error('Audit Logging failed:', err.message);
  }
};

module.exports = { logAction };
