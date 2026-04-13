const { pool, query } = require('./src/config/database');

const checkColumns = async () => {
  try {
    const res = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tickets';
    `);
    console.log('Columns in tickets:', JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error checking columns:', err.message);
  } finally {
    process.exit(0);
  }
};

checkColumns();
