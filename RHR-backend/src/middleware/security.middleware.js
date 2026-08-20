const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
 
// HTTP security headers — CSP configured to allow external JS from same origin
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],                      // allows /app.js served by express
      styleSrc:   ["'self'", "'unsafe-inline'"],   // allows <style> blocks in HTML
      connectSrc: ["'self'"],                      // allows fetch() to same origin
      imgSrc:     ["'self'", "data:"],
      fontSrc:    ["'self'"],
      objectSrc:  ["'none'"],
    }
  },
  // This is an API consumed cross-origin by the Vercel web app and the
  // Flutter mobile app — Helmet's default 'same-origin' CORP silently
  // blocks those responses in the browser even though our CORS middleware
  // allows the origin (CORP is a separate, stricter check browsers apply
  // on top of CORS).
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});
 
// FRONTEND_URL can be a comma-separated list (e.g. the Vercel app +a
// custom domain). Requests with no Origin header (mobile apps, curl,
// server-to-server) are always allowed — CORS is a browser-only concept.
// If FRONTEND_URL isn't set at all, fall back to allowing any origin so
// this never becomes a silent outage from a missing env var.
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
});
 
// Rate limiter for OTP endpoint — max 5 OTP requests per 15 min per IP
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many OTP requests. Try again in 15 minutes.' }
});
 
// Rate limiter for login — max 10 attempts per 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' }
});
 
module.exports = { helmetMiddleware, corsMiddleware, otpLimiter, loginLimiter };