const rateLimit = require('express-rate-limit');

const general = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'),
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const auth = rateLimit({
  windowMs: 60000, // 1 minute
  max: 10, // 10 auth requests per minute
  message: { success: false, message: 'Too many authentication attempts.' },
});

const payment = rateLimit({
  windowMs: 60000,
  max: 15,
  message: { success: false, message: 'Too many payment requests.' },
});

module.exports = { general, auth, payment };
