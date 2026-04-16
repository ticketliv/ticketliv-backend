/**
 * TicketLiv Database Migration
 * Creates all tables for the platform
 * Run: npm run db:migrate
 */
const { pool } = require('./database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Enable extensions
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // === USERS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(20) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        avatar_url TEXT,
        role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'organizer', 'admin', 'superadmin', 'scanner')),
        preferences JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        phone_verified BOOLEAN DEFAULT false,
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === ADMIN USERS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'Admin' CHECK (role IN ('Super Admin', 'Admin', 'Manager', 'Event Organizer', 'Scanner User')),
        permissions JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === ORGANIZERS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        company_name VARCHAR(255),
        logo_url TEXT,
        description TEXT,
        website VARCHAR(500),
        verification_status VARCHAR(50) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
        bank_details JSONB DEFAULT '{}',
        commission_rate DECIMAL(5,2) DEFAULT 10.00,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === CATEGORIES ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        icon_name VARCHAR(100) DEFAULT 'Sparkles',
        color VARCHAR(50) DEFAULT 'indigo',
        status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === EVENTS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organizer_id UUID REFERENCES organizers(id),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        start_date TIMESTAMPTZ,
        end_date TIMESTAMPTZ,
        timezone VARCHAR(100) DEFAULT 'Asia/Kolkata',
        venue_name VARCHAR(500),
        venue_address TEXT,
        map_url TEXT,
        latitude DECIMAL(10,7),
        longitude DECIMAL(10,7),
        status VARCHAR(50) DEFAULT 'Draft' CHECK (status IN ('Draft', 'Live', 'Cancelled', 'Completed', 'Sold Out')),
        publishing_status VARCHAR(50) DEFAULT 'Draft' CHECK (publishing_status IN ('Draft', 'Pending Approval', 'Approved', 'Rejected', 'Published', 'Archived')),
        image_url TEXT,
        video_url TEXT,
        layout_image TEXT,
        gallery JSONB DEFAULT '[]',
        tags JSONB DEFAULT '[]',
        terms JSONB DEFAULT '[]',
        more_info JSONB DEFAULT '[]',
        extra_info JSONB DEFAULT '{}',
        financials JSONB DEFAULT '{}',
        prohibited_items JSONB DEFAULT '[]',
        refund_policy TEXT,
        entry_policy TEXT,
        support_email VARCHAR(255),
        support_phone VARCHAR(20),
        sponsors JSONB DEFAULT '[]',
        field_config JSONB DEFAULT '{}',
        gates JSONB DEFAULT '[]',
        main_media JSONB DEFAULT '[]',
        layout_media JSONB DEFAULT '[]',
        is_featured BOOLEAN DEFAULT false,
        is_popular BOOLEAN DEFAULT false,
        presenter_name VARCHAR(255),
        organizer_name VARCHAR(255),
        total_sales INTEGER DEFAULT 0,
        total_revenue DECIMAL(12,2) DEFAULT 0,
        revenue_currency VARCHAR(10) DEFAULT 'INR',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === UPDATE EVENTS TABLE (Add columns if they don't exist) ===
    await client.query(`
      ALTER TABLE events ADD COLUMN IF NOT EXISTS main_media JSONB DEFAULT '[]';
      ALTER TABLE events ADD COLUMN IF NOT EXISTS layout_media JSONB DEFAULT '[]';
      ALTER TABLE events ADD COLUMN IF NOT EXISTS presenter_name VARCHAR(255);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_name VARCHAR(255);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS gates JSONB DEFAULT '[]';
      ALTER TABLE events ADD COLUMN IF NOT EXISTS total_sales INTEGER DEFAULT 0;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(12,2) DEFAULT 0;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS revenue_currency VARCHAR(10) DEFAULT 'INR';
    `);

    // === EVENT CATEGORIES (many-to-many) ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_categories (
        event_id UUID REFERENCES events(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (event_id, category_id)
      );
    `);

    // === TICKET TYPES ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_types (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_id UUID REFERENCES events(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL DEFAULT 0,
        capacity INTEGER NOT NULL DEFAULT 0,
        sold_count INTEGER DEFAULT 0,
        max_per_user INTEGER DEFAULT 10,
        type VARCHAR(50) DEFAULT 'General',
        metadata JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === VENUES ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS venues (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        address TEXT,
        city VARCHAR(100),
        country VARCHAR(100),
        capacity INTEGER,
        venue_type VARCHAR(50) CHECK (venue_type IN ('Cinema', 'Theatre', 'Arena', 'Stadium', 'Hall', 'OpenAir')),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === SEAT LAYOUTS (The "blueprint") ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS seat_layouts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        is_template BOOLEAN DEFAULT false,
        geometry JSONB NOT NULL DEFAULT '{}', -- SVG/Path data for the whole venue
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === SECTIONS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS sections (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        layout_id UUID REFERENCES seat_layouts(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        level_name VARCHAR(100), -- Balcony, Floor, Stand, etc.
        section_type VARCHAR(50) DEFAULT 'Reserved' CHECK (section_type IN ('Reserved', 'GeneralAdmission')),
        capacity INTEGER,
        path_data TEXT, -- SVG path for the section shape
        color_code VARCHAR(20),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === SEATS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS seats (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
        row_label VARCHAR(20),
        seat_number VARCHAR(20),
        x_pos DECIMAL(10,2), -- Spatial X
        y_pos DECIMAL(10,2), -- Spatial Y
        angle DECIMAL(5,2) DEFAULT 0, -- Orientation
        seat_type VARCHAR(50) DEFAULT 'Standard' CHECK (seat_type IN ('Standard', 'VIP', 'Accessible', 'Companion', 'RestrictedView', 'Media', 'LoveSeat')),
        status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'locked', 'sold', 'blocked')),
        price_tier_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === BOOKINGS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        booking_ref VARCHAR(50) UNIQUE NOT NULL,
        user_id UUID REFERENCES users(id),
        event_id UUID REFERENCES events(id),
        subtotal DECIMAL(12,2) DEFAULT 0,
        tax_amount DECIMAL(12,2) DEFAULT 0,
        service_fee DECIMAL(12,2) DEFAULT 0,
        discount_amount DECIMAL(12,2) DEFAULT 0,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'INR',
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'refunded', 'expired')),
        coupon_id UUID,
        attendee_details JSONB DEFAULT '[]',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === TICKETS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
        ticket_type_id UUID REFERENCES ticket_types(id),
        event_id UUID REFERENCES events(id),
        ticket_number VARCHAR(50) UNIQUE NOT NULL,
        attendee_name VARCHAR(255),
        attendee_email VARCHAR(255),
        attendee_phone VARCHAR(20),
        qr_payload TEXT,
        qr_token TEXT,
        qr_image_url TEXT,
        scan_status VARCHAR(50) DEFAULT 'unused' CHECK (scan_status IN ('unused', 'scanned', 'expired', 'cancelled')),
        scanned_at TIMESTAMPTZ,
        scanned_by UUID,
        gate VARCHAR(100),
        seat_id UUID REFERENCES seats(id),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === PAYMENTS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        booking_id UUID REFERENCES bookings(id),
        transaction_id VARCHAR(255) UNIQUE,
        merchant_transaction_id VARCHAR(255),
        payment_method VARCHAR(50),
        gateway VARCHAR(50) DEFAULT 'phonepe',
        amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
        gateway_response JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === REFUNDS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS refunds (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        payment_id UUID REFERENCES payments(id),
        booking_id UUID REFERENCES bookings(id),
        amount DECIMAL(12,2) NOT NULL,
        reason TEXT,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === COUPONS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code VARCHAR(50) UNIQUE NOT NULL,
        discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('Percentage', 'Fixed')),
        discount_value DECIMAL(10,2) NOT NULL,
        min_purchase DECIMAL(10,2) DEFAULT 0,
        max_discount DECIMAL(10,2),
        expiry_date TIMESTAMPTZ,
        usage_limit INTEGER DEFAULT 0,
        used_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Expired')),
        applicable_event_ids JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === DISCOUNTS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS discounts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('Percentage', 'Fixed')),
        discount_value DECIMAL(10,2) NOT NULL,
        rule_type VARCHAR(50) CHECK (rule_type IN ('EarlyBird', 'Volume', 'Bulk')),
        rule_value VARCHAR(255),
        status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
        applicable_event_ids JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === SCANNER ASSIGNMENTS ===
    await client.query(`
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

    // === SCAN LOGS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS scan_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_id UUID REFERENCES tickets(id),
        event_id UUID REFERENCES events(id),
        scanner_user_id UUID,
        gate VARCHAR(100),
        result VARCHAR(50) CHECK (result IN ('valid', 'invalid', 'duplicate', 'expired', 'cancelled')),
        scanned_at TIMESTAMPTZ DEFAULT NOW(),
        device_info JSONB DEFAULT '{}'
      );
    `);

    // === NOTIFICATIONS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id),
        title VARCHAR(500) NOT NULL,
        body TEXT,
        type VARCHAR(50) DEFAULT 'info',
        is_read BOOLEAN DEFAULT false,
        data JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === ADS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS ads (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(500),
        type VARCHAR(50) DEFAULT 'banner',
        media_url TEXT,
        video_url TEXT,
        target_url TEXT,
        placement VARCHAR(50) DEFAULT 'home',
        status VARCHAR(20) DEFAULT 'Active',
        start_date TIMESTAMPTZ,
        end_date TIMESTAMPTZ,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === TICKET TEMPLATES ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_templates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organizer_id UUID REFERENCES organizers(id),
        name VARCHAR(255) NOT NULL,
        template_type VARCHAR(50) DEFAULT 'classic',
        design_config JSONB NOT NULL DEFAULT '{}',
        is_default BOOLEAN DEFAULT false,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === AUDIT LOGS ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100),
        entity_id UUID,
        old_data JSONB,
        new_data JSONB,
        ip_address INET,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // === INDEXES ===
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bookings_event ON bookings(event_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_booking ON tickets(booking_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_scan ON tickets(scan_status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scan_logs_event ON scan_logs(event_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);`);

    await client.query('COMMIT');
    console.log('✅ Database migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
