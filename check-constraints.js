const { pool, query } = require('./src/config/database');

const checkConstraints = async () => {
  try {
    const res = await query(`
      SELECT conname, pg_get_constraintdef(oid) 
      FROM pg_constraint 
      WHERE conrelid = 'admin_users'::regclass AND contype = 'c';
    `);
    console.log('Constraints:', JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error checking constraints:', err.message);
  } finally {
    process.exit(0);
  }
};

checkConstraints();
