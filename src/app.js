require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const http = require('http');
const { initSocket } = require('./config/socket');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');

// Import Swagger config
const { swaggerUi, specs } = require('./config/swagger');

// Import route modules
const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const categoryRoutes = require('./modules/categories/category.routes');
const eventRoutes = require('./modules/events/event.routes');
const bookingRoutes = require('./modules/bookings/booking.routes');
const paymentRoutes = require('./modules/payments/payment.routes');
const ticketRoutes = require('./modules/tickets/ticket.routes');
const scannerRoutes = require('./modules/scanner/scanner.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const adsRoutes = require('./modules/ads/ads.routes');
const mediaRoutes = require('./modules/media/media.routes');
const marketingRoutes = require('./modules/marketing/marketing.routes');
const adminControlRoutes = require('./modules/admin/adminControl.routes');
const securityController = require('./modules/tickets/security.controller');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Initialize WebSocket
initSocket(server);

// --- CORS Configuration ---
const allowedOrigins = [
  'https://admin.ticketliv.com',
  'https://www.ticketliv.com',
  'https://ticketliv.com',
  process.env.ADMIN_URL,
  process.env.ORGANIZER_URL,
  process.env.MOBILE_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (!origin) return callback(null, true);

    // Allow any ticketliv.com subdomain in production
    if (isProduction && origin.endsWith('ticketliv.com')) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(isProduction ? new Error('Not allowed by CORS') : null, !isProduction);
    }
  },
  credentials: true,
}));

// --- Security & Parsing ---
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// --- Static Files ---
app.use('/uploads', express.static('uploads'));

// --- Rate Limiting ---
app.use('/api/', rateLimiter.general);
app.use('/api/auth/', rateLimiter.auth);

// --- Health Check ---
// Professional Welcome Route
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to the TicketLiv Production API',
    version: '2.5.0',
    status: 'Operational',
    documentation: '/api/docs'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ticketliv-backend', timestamp: new Date().toISOString() });
});

// --- Public Security Endpoints ---
app.get('/.well-known/jwks.json', securityController.getJwks);

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/admin', adminControlRoutes);
app.use('/api/analytics', analyticsRoutes);

// --- API Documentation ---
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// --- Error Handling ---
app.use(notFound);
app.use(errorHandler);

// --- Start Server ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 TicketLiv Backend: http://0.0.0.0:${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = { app, server };
