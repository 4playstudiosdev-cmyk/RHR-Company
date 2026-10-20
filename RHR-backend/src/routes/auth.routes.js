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
const { authenticate: authMw } = require('../middleware/auth.middleware');
const { success, error } = require('../utils/response');
const { featuresOf } = require('../middleware/feature.middleware');
// The features switched on for the logged-in customer / salesman / driver —
// the apps hide what's off. Admins have no per-feature switches (features: null).
router.get('/my-features', authMw, async (req, res) => {
  try {
    const features = await featuresOf(req.user);
    return success(res, { role: req.user.role, features });
  } catch (err) { return error(res, err.message); }
});

// The phone registers its Firebase push token after login (and whenever Firebase
// renews it), so the server can ping it. A token belongs to ONE account at a time:
// if the same phone signs into another account, the old owner's copy is cleared.
const { pgrestPatch } = require('../utils/directQuery');
const TOKEN_TABLE = { salesman: 'salesmen', driver: 'drivers' };
router.post('/fcm-token', authMw, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token || token.length < 20) return error(res, 'token is required', 400);
    const table = TOKEN_TABLE[req.user.role] || 'users';
    for (const t of ['users', 'salesmen', 'drivers']) {
      // same token on another account (or table) -> remove it there
      await pgrestPatch(t, { fcm_token: `eq.${token}`, ...(t === table ? { id: `neq.${req.user.id}` } : {}) }, { fcm_token: null }).catch(() => {});
    }
    await pgrestPatch(table, { id: `eq.${req.user.id}` }, { fcm_token: token });
    return success(res, { registered: true }, 'Push token saved');
  } catch (err) { return error(res, err.message); }
});
// On logout the phone stops receiving this account's pushes.
router.delete('/fcm-token', authMw, async (req, res) => {
  try {
    const table = TOKEN_TABLE[req.user.role] || 'users';
    await pgrestPatch(table, { id: `eq.${req.user.id}` }, { fcm_token: null });
    return success(res, { cleared: true }, 'Push token removed');
  } catch (err) { return error(res, err.message); }
});

router.post('/send-otp',    otpLimiter,       sendOTPHandler);
router.post('/verify-otp',  verifyOtpLimiter, verifyOTPHandler);
router.post('/login',       loginLimiter,     loginHandler);

// Protected routes
router.post('/logout', authenticate, logoutHandler);
router.patch('/approve-customer/:id', authenticate, isAdmin, approveCustomerHandler);
router.patch('/approve-salesman/:id', authenticate, isAdmin, approveSalesmanHandler);
router.patch('/approve-driver/:id',   authenticate, isAdmin, approveDriverHandler);

module.exports = router;
