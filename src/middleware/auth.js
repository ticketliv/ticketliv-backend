const jwt = require('jsonwebtoken');
const { query: _query } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'ticketliv-dev-secret';

/**
 * Verify JWT token from Authorization header
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

/**
 * Role-based access control
 * @param  {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
};

/**
 * Check specific admin permission routes
 * @param {string} requiredPermission - e.g. '/events', '/analytics'
 */
const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    // Superadmin has all permissions
    const role = (req.user.role || '').toLowerCase().replace(/\s/g, '');
    if (role === 'superadmin') {
      return next();
    }
    const permissions = req.user.permissions || [];
    if (!permissions.includes(requiredPermission)) {
      return res.status(403).json({ success: false, message: `Permission denied: ${requiredPermission}` });
    }
    next();
  };
};

/**
 * Optional auth - doesn't fail if no token
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      req.user = jwt.verify(token, JWT_SECRET);
    }
  } catch { /* ignore */ }
  next();
};

module.exports = { authenticate, authorize, checkPermission, optionalAuth };
