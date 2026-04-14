const { pool, query } = require('./database');

const check = async () => {
  try {
    const result = await query('SELECT id, name, email, role, is_active FROM admin_users');
    console.log('--- Admin Users ---');
    console.table(result.rows);
    
    const cats = await query('SELECT count(*) FROM categories');
    console.log(`Categories count: ${cats.rows[0].count}`);
    
  } catch (err) {
    console.error('Check failed:', err.message);
  } finally {
    await pool.end();
  }
};

check();
