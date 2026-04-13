const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { asyncHandler } = require('../../middleware/errorHandler');

/**
 * GET /.well-known/jwks.json
 * Serves the public key for asymmetric signature verification
 */
exports.getJwks = asyncHandler(async (req, res) => {
  const publicKeyPem = fs.readFileSync(path.join(process.cwd(), 'keys', 'public.pem'), 'utf8');
  const publicKey = crypto.createPublicKey(publicKeyPem);
  
  // Export to JWK format (Node 15.9+)
  const jwk = publicKey.export({ format: 'jwk' });

  res.json({
    keys: [
      {
        kty: jwk.kty,
        n: jwk.n,
        e: jwk.e,
        kid: 'ticketliv-key-1',
        use: 'sig',
        alg: 'RS256',
      }
    ]
  });
});
