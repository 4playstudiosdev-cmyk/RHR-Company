const crypto = require('crypto');

// Helmet's xPoweredBy option already strips X-Powered-By by default, so
// this is belt-and-suspenders — the API version/request-id headers are
// the actual new behavior here.
const removeFingerprint = (req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-API-Version', '1.0');
  res.setHeader('X-Request-ID', crypto.randomUUID());
  next();
};

// Strips null bytes and trims surrounding whitespace from every string in
// the request body, recursively. Runs before route handlers ever see the
// body, so a stray null byte can't get written into a name/phone/etc.
const sanitizeRequest = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    const sanitize = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = obj[key].replace(/\0/g, '').trim();
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitize(obj[key]);
        }
      }
    };
    sanitize(req.body);
  }
  next();
};

module.exports = { removeFingerprint, sanitizeRequest };
