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
  }
});
 
const corsMiddleware = cors({
  origin: '*',
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