require('dotenv').config();
const express = require('express');
const { helmetMiddleware, corsMiddleware, generalLimiter } = require('./src/middleware/security.middleware');
const { removeFingerprint, sanitizeRequest } = require('./src/middleware/api-security.middleware');
const { logger, isProd } = require('./src/utils/logger');
const { initWhatsApp } = require('./src/config/whatsapp');
const authRoutes = require('./src/routes/auth.routes');

const app = express();
app.set('trust proxy', 1); // Trust Railway's reverse proxy so rate-limiter sees the real client IP
const PORT = process.env.PORT || 3000;

// The WhatsApp bot (whatsapp-web.js/puppeteer) runs as a background,
// best-effort feature used only for OTP delivery. Bugs inside that library
// (e.g. a Windows file-lock race when it cleans up a logged-out session —
// EBUSY on session_data/session/*.db) must never be allowed to take down
// the whole API — orders/payments/etc. have nothing to do with WhatsApp.
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught exception (server kept alive):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled rejection (server kept alive):', reason);
});

// Security middleware
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(removeFingerprint);
// 10mb, not the 5mb a generic checklist suggests — uploads (product
// images, payment-proof photos, invoices — see storage.controller.js)
// are sent as base64 JSON, which inflates ~33% over the original file
// size, so 5mb would start rejecting real phone-camera photos.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeRequest);
app.use(generalLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'RHR Backend is running',
    environment: process.env.NODE_ENV,
    timestamp: new Date()
  });
});

// Routes
app.use('/api/v1/auth',      authRoutes);
app.use('/api/v1/admins',    require('./src/routes/admins.routes'));
app.use('/api/v1/customers', require('./src/routes/customers.routes'));
app.use('/api/v1/companies', require('./src/routes/companies.routes'));
app.use('/api/v1/products',    require('./src/routes/products.routes'));
app.use('/api/v1/categories', require('./src/routes/categories.routes'));
app.use('/api/v1/orders',    require('./src/routes/orders.routes'));
app.use('/api/v1/payments',  require('./src/routes/payments.routes'));
app.use('/api/v1/ledger',    require('./src/routes/ledger.routes'));
app.use('/api/v1/storage',   require('./src/routes/storage.routes'));
app.use('/api/v1/invoices',  require('./src/routes/invoice.routes'));
app.use('/api/v1/reports',       require('./src/routes/reports.routes'));
app.use('/api/v1/gps',           require('./src/routes/gps.routes'));
app.use('/api/v1/notifications', require('./src/routes/notifications.routes'));
app.use('/api/v1/analytics',     require('./src/routes/analytics.routes'));
app.use('/api/v1/hrm',           require('./src/routes/hrm.routes'));
app.use('/api/v1/employees',     require('./src/routes/employees.routes'));
app.use('/api/v1/salesmen',      require('./src/routes/salesmen.routes'));
app.use('/api/v1/drivers',       require('./src/routes/drivers.routes'));
app.use('/api/v1/visits',        require('./src/routes/visits.routes'));
app.use('/api/v1/admin-location', require('./src/routes/admin-location.routes'));
app.use('/api/v1/production',    require('./src/routes/production.routes'));
app.use('/api/v1/recipes',       require('./src/routes/recipes.routes'));
app.use('/api/v1/transfers',     require('./src/routes/transfers.routes'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler
app.use((err, req, res, next) => {
  if (err.message && err.message.startsWith('CORS blocked')) {
    return res.status(403).json({ success: false, message: 'Access denied — origin not allowed' });
  }
  // A body over the express.json() limit above lands here as a
  // PayloadTooLargeError, not a route handler — surface it as 413
  // instead of a generic 500.
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request payload too large' });
  }
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: isProd ? 'Internal server error' : err.message
  });
});

// Start server immediately, WhatsApp connects in background
function start() {
  console.log('🔄 Initializing WhatsApp bot in background...');
  initWhatsApp(); // fire-and-forget — server starts while WA connects

  app.listen(PORT, () => {
    console.log(`🚀 RHR Backend running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
  });
}

start();
