const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const qrService = require('../src/modules/tickets/qr.service');

async function testSecurity() {
  console.log('--- Testing RSA Security System ---');

  // 1. Generate a QR Payload
  const ticketData = {
    ticketId: 'TEST-123',
    eventId: 'EVT-001',
    eventDate: new Date(Date.now() + 86400000).toISOString(),
    category: 'VIP'
  };

  const qrData = qrService.generateQRPayload(ticketData);
  console.log('Generated Verification URI:', qrData.token);

  // 2. Extract and Verify Token
  const verifyResult = qrService.verifyQRToken(qrData.token);
  if (verifyResult.valid) {
    console.log('✅ Token verified successfully with Public Key');
    console.log('Decoded Payload:', verifyResult.data);
  } else {
    console.error('❌ Token verification failed:', verifyResult.error);
  }

  // 3. Test JWKS Integration Logic
  const publicKeyPem = fs.readFileSync(path.join(process.cwd(), 'keys', 'public.pem'), 'utf8');
  const publicKey = crypto.createPublicKey(publicKeyPem);
  const jwk = publicKey.export({ format: 'jwk' });
  console.log('✅ JWK Export successful:', jwk.kty, jwk.kid || 'ticketliv-key-1');
  
  console.log('--- Security Test Complete ---');
}

testSecurity().catch(console.error);
