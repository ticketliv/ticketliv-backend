const { pool } = require('./database');

const run = async () => {
  try {
    // 1. Alter admin_users role constraint
    await pool.query('ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check');
    await pool.query("ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check CHECK (role IN ('Super Admin', 'Admin', 'Manager', 'Event Organizer', 'Scanner User'))");

    // 2. Add publishing_status to events
    await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS publishing_status VARCHAR(50) DEFAULT 'Draft'");
    await pool.query('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_publishing_status_check');
    await pool.query("ALTER TABLE events ADD CONSTRAINT events_publishing_status_check CHECK (publishing_status IN ('Draft', 'Pending Approval', 'Approved', 'Rejected', 'Published', 'Archived'))");

    // 3. Create scanner_assignments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scanner_assignments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID,
        event_id UUID REFERENCES events(id) ON DELETE CASCADE,
        assigned_by UUID,
        status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, event_id)
      );
    `);
    
    // 4. Add gates to events
    await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS gates JSONB DEFAULT '[]'");

    console.log('✅ Schema updated successfully!');
  } catch (err) {
    console.error('❌ Error updating schema:', err);
  } finally {
    process.exit(0);
  }
};

run();
