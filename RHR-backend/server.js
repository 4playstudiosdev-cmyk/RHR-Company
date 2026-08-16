require('dotenv').config();
const express = require('express');
const path = require('path');
const { helmetMiddleware, corsMiddleware } = require('./src/middleware/security.middleware');
const { initWhatsApp } = require('./src/config/whatsapp');
const authRoutes = require('./src/routes/auth.routes');

const app = express();
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
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Serve test UI
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'RHR Backend is running', timestamp: new Date() });
});

// Routes
app.use('/api/v1/auth',      authRoutes);
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
app.use('/api/v1/visits',        require('./src/routes/visits.routes'));
app.use('/api/v1/admin-location', require('./src/routes/admin-location.routes'));
app.use('/api/v1/production',    require('./src/routes/production.routes'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Start server immediately, WhatsApp connects in background
function start() {
  console.log('🔄 Initializing WhatsApp bot in background...');
  initWhatsApp(); // fire-and-forget — server starts while WA connects

  app.listen(PORT, () => {
    console.log(`🚀 RHR Backend running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`🖥️  Test UI: http://localhost:${PORT}`);
  });
}

start();
