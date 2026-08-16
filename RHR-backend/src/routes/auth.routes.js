const express = require('express');
const router = express.Router();
const {
  sendOTPHandler,
  verifyOTPHandler,
  loginHandler,
  approveCustomerHandler,
  approveSalesmanHandler,
  whatsappStatusHandler,
  whatsappQRHandler
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/role.middleware');
const { otpLimiter, loginLimiter } = require('../middleware/security.middleware');

// Public routes
router.post('/send-otp',    otpLimiter,  sendOTPHandler);
router.post('/verify-otp',               verifyOTPHandler);
router.post('/login',       loginLimiter, loginHandler);
router.get('/whatsapp-status',           whatsappStatusHandler);
router.get('/whatsapp-qr',               whatsappQRHandler);

// Protected routes
router.patch('/approve-customer/:id', authenticate, isAdmin, approveCustomerHandler);
router.patch('/approve-salesman/:id', authenticate, isAdmin, approveSalesmanHandler);

module.exports = router;
