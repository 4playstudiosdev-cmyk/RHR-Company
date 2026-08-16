const { sendOTP, verifyOTP } = require('../services/otp.service');
const {
  registerCustomer, registerSalesman,
  loginWithCredentials,
  approveCustomer, approveSalesman,
  findCustomerByPhone, findSalesmanByPhone,
  generateToken
} = require('../services/auth.service');
const { getWhatsAppStatus, getWhatsAppQR } = require('../config/whatsapp');
const { success, error } = require('../utils/response');

const sendOTPHandler = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return error(res, 'Phone number is required', 400);

    // Check registration status before sending OTP — could be either role
    const existingUser = (await findCustomerByPhone(phone)) || (await findSalesmanByPhone(phone));

    if (!existingUser) {
      // New user — send OTP now so it arrives while they fill the signup form
      const result = await sendOTP(phone);
      return success(res, { ...result, isNewUser: true }, 'OTP sent. Please create your account.');
    }

    if (!existingUser.is_approved) {
      // Registered but waiting for admin approval
      return success(res, { isNewUser: false, isPending: true }, 'Your account is pending admin approval.');
    }

    // Registered + approved — send OTP
    const result = await sendOTP(phone);
    return success(res, { ...result, isNewUser: false, isPending: false }, 'OTP sent to your WhatsApp');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const verifyOTPHandler = async (req, res) => {
  try {
    const { phone, otp, fullName, companyId, shopName, shopAddress, role, position } = req.body;
    if (!phone || !otp || !companyId) {
      return error(res, 'phone, otp, companyId are required', 400);
    }

    const otpResult = await verifyOTP(phone, otp);
    if (!otpResult.valid) return error(res, otpResult.message, 400);

    // Check if user already exists (login) or is new (registration) — could be either role
    const existingUser = (await findCustomerByPhone(phone)) || (await findSalesmanByPhone(phone));

    if (existingUser) {
      if (!existingUser.is_approved) {
        return success(res, { status: 'pending_approval' }, 'Account pending admin approval');
      }
      // Approved existing user — return JWT for login
      const token = generateToken(existingUser);
      return success(res, {
        token,
        user: {
          id:       existingUser.id,
          fullName: existingUser.full_name,
          role:     existingUser.role,
        },
      }, 'Login successful');
    }

    // New user — fullName required for registration
    if (!fullName) return error(res, 'fullName is required for new registration', 400);

    if (role === 'salesman') {
      await registerSalesman({ phone, fullName, companyId, position });
    } else {
      await registerCustomer({ phone, fullName, companyId, shopName, shopAddress });
    }

    return success(
      res,
      { status: 'pending_approval' },
      'Registration successful. Waiting for admin approval.',
      201,
    );
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

const approveSalesmanHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const approvedSalesman = await approveSalesman(id, req.user);
    return success(res, approvedSalesman, 'Salesman approved successfully');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const whatsappStatusHandler = (req, res) => {
  return success(res, getWhatsAppStatus(), 'WhatsApp status');
};

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
  approveSalesmanHandler,
  whatsappStatusHandler,
  whatsappQRHandler,
};
