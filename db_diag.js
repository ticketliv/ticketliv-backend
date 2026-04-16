const { query } = require('./src/config/database');

const runDiag = async () => {
    try {
        console.log('--- DATABASE SCHEMA DIAGNOSTICS ---');
        
        // 1. Check Events Table Columns
        console.log('\n[Checking events table columns...]');
        const eventsSchema = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'events'
            ORDER BY column_name;
        `);
        console.log('Columns count:', eventsSchema.rows.length);
        console.log(JSON.stringify(eventsSchema.rows.map(r => r.column_name), null, 2));

        // 2. Check Event Status Constraints
        console.log('\n[Checking status constraints...]');
        const constraints = await query(`
            SELECT conname, pg_get_constraintdef(oid) 
            FROM pg_constraint 
            WHERE conrelid = 'events'::regclass AND contype = 'c';
        `);
        console.log('Constraints:', JSON.stringify(constraints.rows, null, 2));

        // 3. Check Ticket Types Columns
        console.log('\n[Checking ticket_types table columns...]');
        const ticketsSchema = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'ticket_types'
            ORDER BY column_name;
        `);
        console.log('Columns count:', ticketsSchema.rows.length);
        console.log(JSON.stringify(ticketsSchema.rows.map(r => r.column_name), null, 2));

    } catch (err) {
        console.error('DIAGNOSTICS FAILED:', err.message);
    } finally {
        process.exit(0);
    }
};

runDiag();
