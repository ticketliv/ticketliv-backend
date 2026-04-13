/**
 * QR Code Service
 * Highly secure, production-grade QR generation with compressed payloads, 
 * RSA/HMAC signing, and multi-layer encryption.
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || 'ticketliv-qr-signing-dev';
const QR_ENCRYPTION_KEY = process.env.QR_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef';

// Load RSA Keys for Enterprise-grade RS256 signing
let PRIVATE_KEY, PUBLIC_KEY;
try {
  PRIVATE_KEY = fs.readFileSync(path.join(process.cwd(), 'keys', 'private.pem'), 'utf8');
  PUBLIC_KEY = fs.readFileSync(path.join(process.cwd(), 'keys', 'public.pem'), 'utf8');
} catch (_e) {
  console.warn('RSA Keys not found. Falling back to Secret-based HMAC (HS256).');
}

// Ensure uploads directory exists
const QR_DIR = path.join(process.cwd(), 'uploads', 'qrcodes');
if (!fs.existsSync(QR_DIR)) {
  fs.mkdirSync(QR_DIR, { recursive: true });
}

/**
 * BEST LOGIC: Compressed Payload Generator (Targeting 2.1 Standard)
 * Uses short keys to minimize QR density (faster scans, better reliability)
 */
const generateSecureQRPayload = (ticketData) => {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  
  // High-fidelity compressed payload
  const payload = {
    v: "2.1",             // System version
    t: ticketData.id,     // Ticket UUID
    e: ticketData.eventId, // Event UUID
    u: ticketData.userId,  // User Identity
    ts: currentTimestamp,  // Issued Time
    req: ticketData.mandatoryFields || ['t', 'e'] // Fields required for valid check-in
  };

  const options = {
    algorithm: PRIVATE_KEY ? 'RS256' : 'HS256',
    issuer: 'ticketliv',
    expiresIn: '7d' // Tickets expire 7 days after issue or after event
  };

  const key = PRIVATE_KEY || QR_SIGNING_SECRET;
  const token = jwt.sign(payload, key, options);

  // Encrypt the token so users can't see the internal structure (AES-256)
  const secureToken = encryptToken(token);

  return {
    payload,
    secureToken,
    verificationUrl: `https://verify.ticketliv.com/s/${secureToken}`
  };
};

/**
 * Verify and decrypt a QR token with multi-version support
 */
const verifySecureToken = (inputToken) => {
  try {
    // 1. Extract token from URL if present
    const encryptedToken = inputToken.includes('/s/') 
      ? inputToken.split('/s/')[1] 
      : inputToken;

    // 2. AES Decrypt
    const token = decryptToken(encryptedToken);

    // 3. JWT Verify (Supports both RSA and HMAC)
    const key = PUBLIC_KEY || QR_SIGNING_SECRET;
    const decoded = jwt.verify(token, key, {
      algorithms: ['RS256', 'HS256'],
      issuer: 'ticketliv',
    });

    return { valid: true, data: decoded };
  } catch (err) {
    return { valid: false, error: err.message };
  }
};

/**
 * Dynamic Rotation Payload (60s Window)
 * Used for high-fraud risk events (Anti-Screenshot)
 */
const generateDynamicPayload = (ticketData) => {
    const rotationWindow = 60;
    const currentWindowIdx = Math.floor(Date.now() / (rotationWindow * 1000));

    const payload = {
        v: "3.0-DYN",
        t: ticketData.id,
        rot: currentWindowIdx,
        exp: Math.floor(Date.now() / 1000) + rotationWindow
    };

    const token = jwt.sign(payload, PRIVATE_KEY || QR_SIGNING_SECRET, { 
        algorithm: PRIVATE_KEY ? 'RS256' : 'HS256' 
    });

    return encryptToken(token);
};

// --- Encryption Infrastructure (AES-256-CBC) ---
function getEncryptionKey() {
  return crypto.scryptSync(QR_ENCRYPTION_KEY, 'ticketliv-industrial-salt', 32);
}

function encryptToken(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptToken(encryptedText) {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');
  if (parts.length !== 2) throw new Error('ERR_INVALID_CRYP_FORMAT');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Generate QR Images & Streamers
 */
const generateQRDataUri = async (data, options = {}) => {
  return await QRCode.toDataURL(data, {
    width: options.width || 400,
    margin: options.margin || 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: options.dark || '#04061a',
      light: '#ffffff',
    },
  });
};

/**
 * Generate QR code as a Buffer (for sharp compositing)
 */
const generateQRBuffer = async (data, options = {}) => {
  return await QRCode.toBuffer(data, {
    width: options.width || 400,
    margin: options.margin || 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: options.dark || '#04061a',
      light: '#ffffff',
    },
  });
};

/**
 * Generate QR payload for ticket generation (compatible wrapper)
 * Returns { payload, token } for use by ticket.controller.js
 */
const generateQRPayload = (ticketData) => {
  const result = generateSecureQRPayload({
    id: ticketData.ticketId,
    eventId: ticketData.eventId,
    userId: ticketData.userId,
    ticketNumber: ticketData.ticketNumber,
  });
  return {
    payload: { ...result.payload, tid: ticketData.ticketNumber, ...ticketData },
    token: result.secureToken,
  };
};

/**
 * Generate and save QR code as an image file. Returns the URL path.
 */
const generateQRImage = async (token, options = {}) => {
  const filename = `qr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.png`;
  const filepath = path.join(QR_DIR, filename);
  await QRCode.toFile(filepath, token, {
    width: options.width || 400,
    margin: options.margin || 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: options.dark || '#04061a',
      light: options.light || '#ffffff',
    },
  });
  return `/uploads/qrcodes/${filename}`;
};

/**
 * Generate a hash for a ticket number (used by offline manifests)
 */
const generateTicketHash = (ticketNumber) => {
  return crypto.createHmac('sha256', QR_SIGNING_SECRET)
    .update(ticketNumber)
    .digest('hex')
    .substring(0, 16);
};

/**
 * Alias for verifySecureToken (used by scanner.controller.js)
 */
const verifyQRToken = verifySecureToken;

module.exports = {
  generateSecureQRPayload,
  verifySecureToken,
  verifyQRToken,
  generateDynamicPayload,
  generateQRDataUri,
  generateQRBuffer,
  generateQRPayload,
  generateQRImage,
  generateTicketHash,
};
