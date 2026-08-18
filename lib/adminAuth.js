// HTTP Basic Auth for /admin. Requires ADMIN_USER and ADMIN_PASSWORD to be
// set as environment variables — if either is missing, admin access is
// blocked entirely (fail closed) rather than left open.
const crypto = require('crypto');

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length to avoid leaking length via timing
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = function adminAuth(req, res, next) {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return res
      .status(503)
      .send('Admin access is not configured. Set ADMIN_USER and ADMIN_PASSWORD environment variables.');
  }

  const header = req.headers.authorization;
  if (header && header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sepIndex = decoded.indexOf(':');
    const user = decoded.slice(0, sepIndex);
    const pass = decoded.slice(sepIndex + 1);

    if (timingSafeStringEqual(user, expectedUser) && timingSafeStringEqual(pass, expectedPass)) {
      return next();
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="Junior Golf Wales Admin"');
  res.status(401).send('Authentication required.');
};
