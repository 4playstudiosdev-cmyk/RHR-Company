const { sendOTP, verifyOTP } = require('../services/otp.service');
const { registerCustomer, loginWithCredentials, approveCustomer } = require('../services/auth.service');
const { getWhatsAppStatus, getWhatsAppQR } = require('../config/whatsapp');
const { success, error } = require('../utils/response');

const sendOTPHandler = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return error(res, 'Phone number is required', 400);
    const result = await sendOTP(phone);
    return success(res, result, 'OTP sent to your WhatsApp');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const verifyOTPHandler = async (req, res) => {
  try {
    const { phone, otp, fullName, companyId } = req.body;
    if (!phone || !otp || !fullName || !companyId) {
      return error(res, 'phone, otp, fullName, companyId are required', 400);
    }
    const otpResult = await verifyOTP(phone, otp);
    if (!otpResult.valid) return error(res, otpResult.message, 400);
    const newUser = await registerCustomer({ phone, fullName, companyId });
    return success(res, { userId: newUser.id, status: 'pending_approval' },
      'Registration successful. Waiting for admin approval.', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const loginHandler = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return error(res, 'Email and password are required', 400);
    const result = await loginWithCredentials({ email, password });
    return success(res, result, 'Login successful');
  } catch (err) {
    return error(res, err.message, 401);
  }
};

const approveCustomerHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const approvedUser = await approveCustomer(id, req.user);
    return success(res, approvedUser, 'Customer approved successfully');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

// GET /api/v1/auth/whatsapp-status — public, UI polls this
const whatsappStatusHandler = (req, res) => {
  return success(res, getWhatsAppStatus(), 'WhatsApp status');
};

// GET /api/v1/auth/whatsapp-qr — returns QR as base64 image for browser display
const whatsappQRHandler = (req, res) => {
  const qrImage = getWhatsAppQR();
  if (!qrImage) {
    return error(res, 'No QR code available — WhatsApp may already be connected or still loading', 404);
  }
  return success(res, { qr: qrImage }, 'QR code ready to scan');
};

module.exports = {
  sendOTPHandler,
  verifyOTPHandler,
  loginHandler,
  approveCustomerHandler,
  whatsappStatusHandler,
  whatsappQRHandler
};
