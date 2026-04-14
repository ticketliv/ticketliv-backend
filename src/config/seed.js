/**
 * Seed initial data for development
 * Run: npm run db:seed
 */
const { pool, query } = require('./database');
const bcrypt = require('bcryptjs');

const seed = async () => {
  try {
    // Seed categories
    const categories = [
      { name: 'Featured', icon_name: 'Star', color: 'yellow' },
      { name: 'Popular', icon_name: 'TrendingUp', color: 'pink' },
      { name: 'Marathon', icon_name: 'Footprints', color: 'orange' },
      { name: 'Concerts', icon_name: 'Music', color: 'rose' },
      { name: 'Sports', icon_name: 'Trophy', color: 'emerald' },
      { name: 'Adventure', icon_name: 'Compass', color: 'teal' },
      { name: 'Innovation', icon_name: 'Lightbulb', color: 'amber' },
      { name: 'Tech', icon_name: 'MonitorPlay', color: 'cyan' },
      { name: 'Music', icon_name: 'Mic', color: 'purple' },
      { name: 'Festival', icon_name: 'PartyPopper', color: 'indigo' },
      { name: 'Food', icon_name: 'Coffee', color: 'rose' },
      { name: 'Business', icon_name: 'Briefcase', color: 'blue' },
      { name: 'Comedy', icon_name: 'Smile', color: 'violet' },
      { name: 'Cinema', icon_name: 'Camera', color: 'slate' },
      { name: 'Real Estate', icon_name: 'Home', color: 'zinc' },
    ];

    for (const cat of categories) {
      await query(
        'INSERT INTO categories (name, icon_name, color, status) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING',
        [cat.name, cat.icon_name, cat.color, 'Active']
      );
    }
    console.log('✅ Categories seeded');

    // Seed superadmin
    const passwordHash = await bcrypt.hash('admin123', 12);
    const permissions = JSON.stringify(['/dashboard', '/events', '/marketing', '/attendees', '/create-event', '/categories', '/ads', '/analytics', '/finance', '/reports', '/settings', '/team', '/tickets']);
    
    await query(
      `INSERT INTO admin_users (name, email, password_hash, role, permissions) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (email) DO UPDATE SET 
       password_hash = EXCLUDED.password_hash,
       permissions = EXCLUDED.permissions,
       updated_at = NOW()`,
      ['Super Admin', 'admin@ticketliv.com', passwordHash, 'Super Admin', permissions]
    );
    console.log('✅ Admin user seeded (admin@ticketliv.com)');

    // Seed scanner user
    const scannerPasswordHash = await bcrypt.hash('scanner123', 12);
    const scannerPermissions = JSON.stringify(['/scanner-app']);
    
    await query(
      `INSERT INTO admin_users (name, email, password_hash, role, permissions) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (email) DO UPDATE SET 
       password_hash = EXCLUDED.password_hash,
       permissions = EXCLUDED.permissions,
       updated_at = NOW()`,
      ['Event Scanner', 'scanner@ticketliv.com', scannerPasswordHash, 'Scanner User', scannerPermissions]
    );
    console.log('✅ Scanner user seeded (scanner@ticketliv.com)');

    // Seed New Admin User
    const sysAdminPasswordHash = await bcrypt.hash('password123', 12);
    const sysAdminPermissions = JSON.stringify(['/dashboard', '/events', '/marketing', '/attendees', '/create-event', '/categories', '/ads', '/analytics', '/finance', '/reports', '/settings', '/team', '/tickets']);
    
    await query(
      `INSERT INTO admin_users (name, email, password_hash, role, permissions) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (email) DO UPDATE SET 
       password_hash = EXCLUDED.password_hash,
       permissions = EXCLUDED.permissions,
       updated_at = NOW()`,
      ['System Admin', 'sysadmin@ticketliv.com', sysAdminPasswordHash, 'Super Admin', sysAdminPermissions]
    );
    console.log('✅ New Admin user seeded (sysadmin@ticketliv.com)');

    // Seed Ads
    const ads = [
      { title: 'Early Bird Special: 20% OFF!', type: 'image', media_url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=80&w=1200', target_url: 'Explore' },
      { title: 'Experience the Rhythm!', type: 'video', video_url: 'https://vjs.zencdn.net/v/oceans.mp4', target_url: 'Explore' },
      { title: 'Concerts of the Summer', type: 'image', media_url: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&q=80&w=1200', target_url: 'Explore' },
      { title: 'Himalayan Base Camp Trek', type: 'image', media_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1200', target_url: 'Explore' },
      { title: 'Sports Season is Here!', type: 'image', media_url: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&q=80&w=1200', target_url: 'Explore' },
      { title: 'Friday Night Comedy', type: 'image', media_url: 'https://images.unsplash.com/photo-1527224857830-43a7acc85260?auto=format&fit=crop&q=80&w=1200', target_url: 'Explore' },
      { title: 'The Grand Finals', type: 'image', media_url: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&q=80&w=1200', target_url: 'Explore' },
      { title: 'Art & Craft Workshop', type: 'image', media_url: 'https://images.unsplash.com/photo-1565191999001-551c187427bb?auto=format&fit=crop&q=80&w=1200', target_url: 'Explore' },
      { title: 'Summer Carnival', type: 'image', media_url: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&q=80&w=1200', target_url: 'Explore' }
    ];

    for (const ad of ads) {
      await query(
        'INSERT INTO ads (title, type, media_url, video_url, target_url, status) VALUES ($1, $2, $3, $4, $5, $6)',
        [ad.title, ad.type, ad.media_url || null, ad.video_url || null, ad.target_url, 'Active']
      );
    }
    console.log('✅ Ads seeded');

    console.log('\n🌱 Database seeding completed!');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  } finally {
    await pool.end();
  }
};

seed();
