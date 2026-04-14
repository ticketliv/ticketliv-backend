/**
 * Database configuration and pool initialization
 */
const { Pool } = require('pg');

const config = process.env.DATABASE_URL 
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'ticketliv',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    };

const pool = new Pool({
  ...config,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
});

/**
 * Standardized query helper with performance monitoring
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries in non-production environments
    if (duration > 1000 && process.env.NODE_ENV !== 'production') {
      console.warn(`⚠️ Slow query (${duration}ms):`, text.substring(0, 100));
    }
    
    return result;
  } catch (err) {
    // Standardize error logging
    console.error(`❌ DB Query failed: ${err.message}`, { query: text.substring(0, 100) });
    throw err;
  }
};

const getClient = () => pool.connect();

module.exports = { pool, query, getClient };
