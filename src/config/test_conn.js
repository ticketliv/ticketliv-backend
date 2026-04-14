const { Client } = require('pg');

const test = async () => {
    const url = process.env.DATABASE_URL;
    console.log(`Testing connection to: ${url.split('@')[1]}`); // Mask password
    
    const client = new Client({
        connectionString: url,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        console.log('✅ Connected successfully!');
        const res = await client.query('SELECT current_user, now()');
        console.log('DB Info:', res.rows[0]);
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        console.error('Stack:', err.stack);
    } finally {
        await client.end();
    }
};

test();
