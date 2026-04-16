const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../../config/database');
const { asyncHandler, AppError } = require('../../middleware/errorHandler');
const { cache } = require('../../config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'ticketliv-dev-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'ticketliv-refresh-secret';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '24h';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '30d';

const DEFAULT_ROLE_PERMISSIONS = {
  Superadmin: ['/dashboard', '/events', '/marketing', '/attendees', '/create-event', '/categories', '/ads', '/analytics', '/finance', '/reports', '/settings', '/team', '/tickets', '/admin-control'],
  'Super Admin': ['/dashboard', '/events', '/marketing', '/attendees', '/create-event', '/categories', '/ads', '/analytics', '/finance', '/reports', '/settings', '/team', '/tickets', '/admin-control'],
  Admin: ['/dashboard', '/events', '/marketing', '/attendees', '/create-event', '/categories', '/ads', '/analytics', '/finance', '/reports', '/settings', '/team', '/tickets', '/admin-control'],
  Manager: ['/dashboard', '/events', '/create-event', '/attendees', '/categories', '/analytics', '/reports', '/tickets', '/admin-control'],
  Editor: ['/dashboard', '/events', '/create-event', '/categories', '/marketing', '/ads', '/tickets'],
  Viewer: ['/dashboard', '/events', '/attendees', '/analytics', '/reports'],
  'Event Organizer': ['/dashboard', '/events', '/create-event', '/attendees', '/tickets'],
  'Scanner User': ['/scanner-app'],
};

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, permissions: user.permissions },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRY }
  );
  return { accessToken, refreshToken };
};

// POST /auth/register
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  // Check existing
  const existing = await query('SELECT id FROM admin_users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new AppError('Email already registered', 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const permissions = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.Viewer;

  const result = await query(
    `INSERT INTO admin_users (name, email, password_hash, role, permissions) 
     VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, permissions, created_at`,
    [name, email, passwordHash, role, JSON.stringify(permissions)]
  );

  const user = result.rows[0];
  const tokens = generateTokens(user);

  // Store refresh token in Redis
  await cache.set(`refresh:${user.id}`, tokens.refreshToken, 7 * 24 * 3600);

  res.status(201).json({
    success: true,
    data: { ...user, permissions: JSON.parse(user.permissions || '[]') },
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
});

// POST /auth/login
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;


  const result = await query(
    'SELECT id, name, email, password_hash, role, permissions FROM admin_users WHERE LOWER(email) = LOWER($1) AND is_active = true',
    [email]
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid email or password', 401);
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AppError('Invalid email or password', 401);
  }

  const permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || []);
  const userData = { id: user.id, name: user.name, email: user.email, role: user.role, permissions };
  const tokens = generateTokens(userData);

  await cache.set(`refresh:${user.id}`, tokens.refreshToken, 7 * 24 * 3600);

  res.json({
    success: true,
    data: userData,
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
});

// POST /auth/refresh
exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new AppError('Refresh token required', 400);

  const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  const result = await query(
    'SELECT id, name, email, role, permissions FROM admin_users WHERE id = $1 AND is_active = true',
    [decoded.id]
  );
  if (result.rows.length === 0) throw new AppError('User not found', 404);

  const user = result.rows[0];
  const permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || []);
  const userData = { ...user, permissions };
  const tokens = generateTokens(userData);

  res.json({ success: true, token: tokens.accessToken, refreshToken: tokens.refreshToken });
});

// GET /auth/me
exports.getMe = asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT id, name, email, role, permissions, created_at FROM admin_users WHERE id = $1',
    [req.user.id]
  );
  if (result.rows.length === 0) throw new AppError('User not found', 404);

  const user = result.rows[0];
  user.permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || []);
  res.json({ success: true, data: user });
});

// GET /auth/users
exports.getAllUsers = asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT id, name, email, role, permissions, is_active, created_at FROM admin_users ORDER BY created_at DESC'
  );
  const users = result.rows.map(u => ({
    ...u,
    permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions) : (u.permissions || []),
  }));
  res.json({ success: true, data: users });
});

// POST /auth/users
exports.createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  const existing = await query('SELECT id FROM admin_users WHERE email = $1', [email]);
  if (existing.rows.length > 0) throw new AppError('Email already exists', 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const permissions = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.Viewer;

  const result = await query(
    `INSERT INTO admin_users (name, email, password_hash, role, permissions) 
     VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, permissions, created_at`,
    [name, email, passwordHash, role, JSON.stringify(permissions)]
  );

  const user = result.rows[0];
  user.permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || []);
  res.status(201).json({ success: true, data: user });
});

// PUT /auth/users/:id
exports.updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email, password, role } = req.body;

  const updates = [];
  const params = [];
  let paramIdx = 1;

  if (name) {
    updates.push(`name = $${paramIdx++}`);
    params.push(name);
  }
  if (email) {
    updates.push(`email = $${paramIdx++}`);
    params.push(email);
  }
  if (role) {
    updates.push(`role = $${paramIdx++}`);
    params.push(role);
  }
  if (password) {
    const passwordHash = await bcrypt.hash(password, 12);
    updates.push(`password_hash = $${paramIdx++}`);
    params.push(passwordHash);
  }

  if (updates.length === 0) throw new AppError('No update data provided', 400);

  params.push(id);
  const queryText = `UPDATE admin_users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIdx} RETURNING id, name, email, role, permissions, is_active`;
  
  const result = await query(queryText, params);
  if (result.rows.length === 0) throw new AppError('User not found', 404);

  const user = result.rows[0];
  user.permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || []);
  res.json({ success: true, data: user });
});

// PUT /auth/users/:id/permissions
exports.updatePermissions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { permissions, role } = req.body;

  const result = await query(
    `UPDATE admin_users SET permissions = $1, role = COALESCE($2, role), updated_at = NOW() 
     WHERE id = $3 RETURNING id, name, email, role, permissions`,
    [JSON.stringify(permissions), role || null, id]
  );
  if (result.rows.length === 0) throw new AppError('User not found', 404);

  const user = result.rows[0];
  user.permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || []);
  res.json({ success: true, data: user });
});

// DELETE /auth/users/:id
exports.deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await query('DELETE FROM admin_users WHERE id = $1', [id]);
  res.json({ success: true, message: 'User deleted' });
});

// POST /auth/logout
exports.logout = asyncHandler(async (req, res) => {
  await cache.del(`refresh:${req.user.id}`);
  res.json({ success: true, message: 'Logged out' });
});
