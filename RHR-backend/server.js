require('dotenv').config();
const express = require('express');
const path = require('path');
const { helmetMiddleware, corsMiddleware } = require('./src/middleware/security.middleware');
const { initWhatsApp } = require('./src/config/whatsapp');
const authRoutes = require('./src/routes/auth.routes');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use('/api/v1/products',  require('./src/routes/products.routes'));
app.use('/api/v1/orders',    require('./src/routes/orders.routes'));
app.use('/api/v1/payments',  require('./src/routes/payments.routes'));
app.use('/api/v1/ledger',    require('./src/routes/ledger.routes'));
app.use('/api/v1/storage',   require('./src/routes/storage.routes'));
app.use('/api/v1/invoices',  require('./src/routes/invoice.routes'));

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
