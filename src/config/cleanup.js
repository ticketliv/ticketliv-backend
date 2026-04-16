const { query, pool } = require('./database');

const cleanup = async () => {
    try {
        console.log('--- STARTING DATABASE CLEANUP ---');
        
        // Truncate high-level tables with CASCADE to clean up dependencies
        // We preserve categories and admin_users
        await query('TRUNCATE events, ticket_types, event_categories, ads CASCADE');
        
        console.log('✅ Events, Tickets, and Ads cleared.');
        console.log('✅ Bookings and Relationships purged.');
        
        console.log('\n✨ Database cleanup completed successfully!');
    } catch (err) {
        console.error('❌ CLEANUP FAILED:', err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
};

cleanup();
