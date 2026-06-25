const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/invoice.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

// Manual regenerate — admin only
router.post('/generate/:orderId', authenticate, isAdmin, ctrl.generateInvoiceHandler);

// Get download URL for an order's invoice
router.get('/download/:orderId',  authenticate, ctrl.downloadInvoiceHandler);

module.exports = router;
