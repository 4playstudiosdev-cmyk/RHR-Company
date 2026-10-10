const express = require('express');
const router = express.Router();
const {
  sendOTPHandler,
  verifyOTPHandler,
  loginHandler,
  logoutHandler,
  approveCustomerHandler,
  approveSalesmanHandler,
  approveDriverHandler,
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/role.middleware');
const { otpLimiter, loginLimiter, verifyOtpLimiter } = require('../middleware/security.middleware');

// Public routes
router.post('/send-otp',    otpLimiter,       sendOTPHandler);
router.post('/verify-otp',  verifyOtpLimiter, verifyOTPHandler);
router.post('/login',       loginLimiter,     loginHandler);

// Protected routes
router.post('/logout', authenticate, logoutHandler);
router.patch('/approve-customer/:id', authenticate, isAdmin, approveCustomerHandler);
router.patch('/approve-salesman/:id', authenticate, isAdmin, approveSalesmanHandler);
router.patch('/approve-driver/:id',   authenticate, isAdmin, approveDriverHandler);

module.exports = router;
