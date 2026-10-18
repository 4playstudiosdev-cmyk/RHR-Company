const { sendOTP, verifyOTP } = require('../services/otp.service');
const {
  registerCustomer, registerSalesman, registerDriver,
  loginWithCredentials, releaseSessionLock,
  approveCustomer, approveSalesman, approveDriver,
  findCustomerByPhone, findSalesmanByPhone, findDriverByPhone,
  generateToken
} = require('../services/auth.service');
const { success, error } = require('../utils/response');
const { remindPending } = require('../services/accountStatusMessages.service');

const sendOTPHandler = async (req, res) => {
  try {
    const { phone, forceSend } = req.body;
    if (!phone) return error(res, 'Phone number is required', 400);

    // Check registration status before sending OTP — could be any role
    const existingUser = (await findCustomerByPhone(phone))
      || (await findSalesmanByPhone(phone))
      || (await findDriverByPhone(phone));

    if (!existingUser) {
      if (!forceSend) {
        // First call, from the phone-entry screen — new user, just route
        // to the signup/profile form. Don't send the OTP yet: it used to
        // go out right here, before the form was even shown, so by the
        // time it was filled out and submitted the code had been sitting
        // in their WhatsApp for minutes already.
        return success(res, { isNewUser: true }, 'Please complete your profile.');
      }
      // Second call, with forceSend — the form's own "Next" button, once
      // every field is filled in. This is the real send.
      const result = await sendOTP(phone);
      return success(res, { ...result, isNewUser: true }, 'OTP sent. Please verify your WhatsApp number.');
    }

    if (!existingUser.is_approved) {
      // Registered but waiting for admin approval — no OTP, but let them
      // know on WhatsApp where things stand (throttled, see the service).
      remindPending(existingUser.role, existingUser);
      return success(res, { isNewUser: false, isPending: true }, 'Your account is pending admin approval.');
    }

    // Registered + approved — send OTP
    const result = await sendOTP(phone);
    return success(res, { ...result, isNewUser: false, isPending: false }, 'OTP sent to your WhatsApp');
  } catch (err) {
    const isFlood = err.message.includes('Too many OTP requests');
    return error(res, err.message, isFlood ? 429 : 500);
  }
};

const verifyOTPHandler = async (req, res) => {
  try {
    const {
      phone, otp, fullName, companyId, shopName, shopAddress, area, role, position, carNumber,
      email, nicNumber, whatsappPhone,
      profileImageBase64, profileImageMime,
      nicFrontBase64, nicFrontMime,
      nicBackBase64, nicBackMime,
      shopImageBase64, shopImageMime,
      shopLatitude, shopLongitude,
    } = req.body;
    if (!phone || !otp || !companyId) {
      return error(res, 'phone, otp, companyId are required', 400);
    }

    const otpResult = await verifyOTP(phone, otp);
    if (!otpResult.valid) return error(res, otpResult.message, 400);

    // Check if user already exists (login) or is new (registration) — could be any role
    const existingUser = (await findCustomerByPhone(phone))
      || (await findSalesmanByPhone(phone))
      || (await findDriverByPhone(phone));

    if (existingUser) {
      if (!existingUser.is_approved) {
        return success(res, { status: 'pending_approval' }, 'Account pending admin approval');
      }
      // Approved existing user — return JWT for login
      const token = generateToken(existingUser);
      const responseUser = {
        id:        existingUser.id,
        fullName:  existingUser.full_name,
        role:      existingUser.role,
        carNumber: existingUser.car_number,
      };
      // "Complete Your Profile" gate, per role — field list must match
      // customers.controller.js's isProfileComplete (customer) and
      // salesmen.routes.js / drivers.routes.js's own copies (salesman /
      // driver), since each role collects a different set of fields.
      const REQUIRED_PROFILE_FIELDS_BY_ROLE = {
        customer: [
          'full_name', 'nic_number', 'shop_name', 'shop_image_url',
          'shop_latitude', 'shop_longitude', 'whatsapp_phone',
          'profile_photo_url', 'nic_image_url', 'nic_back_image_url',
        ],
        salesman: [
          'full_name', 'phone', 'nic_number',
          'profile_photo_url', 'nic_image_url', 'nic_back_image_url',
        ],
        driver: [
          'full_name', 'phone', 'nic_number', 'car_number',
          'profile_photo_url', 'nic_image_url', 'nic_back_image_url',
        ],
      };
      const requiredFields = REQUIRED_PROFILE_FIELDS_BY_ROLE[existingUser.role];
      if (requiredFields) {
        responseUser.profileComplete = requiredFields.every(
          (f) => existingUser[f] != null && String(existingUser[f]).trim() !== ''
        );
      }
      return success(res, { token, user: responseUser }, 'Login successful');
    }

    // New user — fullName required for registration
    if (!fullName) return error(res, 'fullName is required for new registration', 400);

    if (role === 'salesman') {
      await registerSalesman({ phone, fullName, companyId, position });
    } else if (role === 'driver') {
      await registerDriver({ phone, fullName, companyId, carNumber });
    } else {
      await registerCustomer({
        phone, fullName, companyId, shopName, shopAddress, area,
        email, nicNumber, whatsappPhone,
        profileImageBase64, profileImageMime,
        nicFrontBase64, nicFrontMime,
        nicBackBase64, nicBackMime,
        shopImageBase64, shopImageMime,
        shopLatitude, shopLongitude,
      });
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
    const { email, password, latitude, longitude, force } = req.body;
    if (!email || !password) return error(res, 'Email and password are required', 400);
    const result = await loginWithCredentials({ email, password, latitude, longitude, force: !!force });
    return success(res, result, 'Login successful');
  } catch (err) {
    return error(res, err.message, 401);
  }
};

// Clears the single-session lock so this account can be logged into
// elsewhere right away, instead of waiting for the lock to self-expire.
const logoutHandler = async (req, res) => {
  try {
    await releaseSessionLock(req.user.id);
    return success(res, { loggedOut: true }, 'Logged out');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const approveCustomerHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const approvedUser = await approveCustomer(id, req.user, req.body.rate_tier, req.body.credit_limit);
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

const approveDriverHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const approvedDriver = await approveDriver(id, req.user);
    return success(res, approvedDriver, 'Driver approved successfully');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

module.exports = {
  sendOTPHandler,
  verifyOTPHandler,
  loginHandler,
  logoutHandler,
  approveCustomerHandler,
  approveSalesmanHandler,
  approveDriverHandler,
};
