const { pool, query } = require('./src/config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const updateAndSeed = async () => {
  try {
    // 1. Update constraints
    console.log('Updating role constraints...');
    await query('ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check');
    await query("ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check CHECK (role IN ('Super Admin', 'Superadmin', 'Admin', 'Manager', 'Editor', 'Viewer', 'Event Organizer', 'Scanner User'))");
    console.log('✅ Role constraints updated');

    // 2. Seed scanner user
    console.log('Seeding scanner user...');
    const scannerPasswordHash = await bcrypt.hash('scanner123', 12);
    const scannerPermissions = JSON.stringify(['/scanner-app']);
    const id = uuidv4();
    
    await query(
      `INSERT INTO admin_users (id, name, email, password_hash, role, permissions) 
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING`,
      [id, 'Event Scanner', 'scanner@ticketliv.com', scannerPasswordHash, 'Scanner User', scannerPermissions]
    );
    console.log('✅ Scanner user seeded (scanner@ticketliv.com) with id:', id);
  } catch (err) {
    console.error('❌ Update and seed failed:', err.message);
  } finally {
    process.exit(0);
  }
};

updateAndSeed();
