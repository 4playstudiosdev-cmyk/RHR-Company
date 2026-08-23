const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// HTTP security headers. No CSP directives — this is a pure JSON API (no
// HTML/test-UI served here anymore), so CSP has nothing to protect.
const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
  // This is an API consumed cross-origin by the Vercel web app and the
  // Flutter mobile app — Helmet's default 'same-origin' CORP silently
  // blocks those responses in the browser even though our CORS middleware
  // allows the origin (CORP is a separate, stricter check browsers apply
  // on top of CORS).
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xFrameOptions: { action: 'deny' },
  xContentTypeOptions: true,
  xXssProtection: true
});

// FRONTEND_URL can be a comma-separated list (e.g. the Vercel app + a
// custom domain) — set in Railway Variables. Local dev origins are always
// allowed on top of that. Requests with no Origin header (mobile apps,
// curl, server-to-server) are always allowed — CORS is a browser-only
// concept. If FRONTEND_URL isn't set at all, fall back to allowing any
// origin so this never becomes a silent outage from a missing env var.
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  ...(process.env.FRONTEND_URL || '').split(',').map((s) => s.trim()).filter(Boolean)
];

const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || !process.env.FRONTEND_URL || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS blocked: ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});

// Rate limiter for OTP endpoint — max 5 OTP requests per 15 min per IP
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests. Try again in 15 minutes.' }
});

// Rate limiter for login — max 10 attempts per 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' }
});

// General rate limiter — all routes, generous ceiling so a busy admin
// dashboard (several parallel requests per page, live GPS polling) never
// gets throttled during normal use.
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' }
});

module.exports = { helmetMiddleware, corsMiddleware, otpLimiter, loginLimiter, generalLimiter };
