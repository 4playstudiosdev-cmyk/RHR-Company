const bcrypt = require('bcryptjs');
const axios = require('axios');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');

// OTPs are sent through the standalone RHR-whatsapp-bot service (separate
// Railway deployment, keeps its own WhatsApp session) instead of a
// whatsapp-web.js client running inside this backend.
async function sendWhatsAppMessage(phoneNumber, message) {
  const serviceUrl = process.env.WHATSAPP_SERVICE_URL;
  if (!serviceUrl) throw new Error('WHATSAPP_SERVICE_URL is not configured');

  // The bot returns a real 404/503 for expected failure cases ("not
  // registered on WhatsApp", "not ready yet") with a useful message
  // body — axios's default validateStatus throws on those before the
  // body is ever read, which was surfacing as an opaque "Request failed
  // with status code 404" instead of the actual reason. validateStatus
  // here lets every response through so that message always comes back.
  const { data } = await axios.post(
    `${serviceUrl}/send-whatsapp`,
    { phone: phoneNumber, message },
    { validateStatus: () => true }
  );
  if (!data?.success) throw new Error(data?.message || 'WhatsApp send failed');
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Normalize phone to always store without + and with 92 prefix
function normalizePhone(phone) {
  let cleaned = phone.replace(/[\s\-]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
  if (cleaned.startsWith('0')) cleaned = '92' + cleaned.slice(1);
  return cleaned;
}

async function sendOTP(phoneNumber) {
  const phone     = normalizePhone(phoneNumber);
  const otp       = generateOTP();
  const expiryMin = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
  const expiresAt = new Date(Date.now() + expiryMin * 60 * 1000);

  const hashedOTP = await bcrypt.hash(otp, 10);

  // Invalidate existing unused OTPs for this phone
  try {
    await pgrestPatch('otp_verifications', { phone: `eq.${phone}`, is_used: 'eq.false' }, { is_used: true });
  } catch (invalidateError) {
    console.error('OTP invalidate warning:', invalidateError.message);
  }

  // Insert new OTP
  try {
    await pgrestPost('otp_verifications', {
      phone:      phone,
      otp_code:   hashedOTP,
      is_used:    false,
      expires_at: expiresAt.toISOString(),
    });
  } catch (insertError) {
    console.error('OTP insert failed:', insertError.message);
    throw new Error('OTP DB error: ' + insertError.message);
  }

  // Send via WhatsApp (whatsapp.js handles its own format conversion)
  const message =
    '*RHR & Company Verification*\n\n' +
    'Your OTP code is: *' + otp + '*\n\n' +
    'This code expires in ' + expiryMin + ' minutes.\n' +
    'Do not share this code with anyone.';

  await sendWhatsAppMessage(phoneNumber, message);

  return { sent: true, expiresAt };
}

async function verifyOTP(phoneNumber, submittedOTP) {
  const phone = normalizePhone(phoneNumber);

  let rows;
  try {
    rows = await pgrestGet('otp_verifications', {
      select: '*',
      phone: `eq.${phone}`,
      is_used: 'eq.false',
      expires_at: `gt.${new Date().toISOString()}`,
      order: 'created_at.desc',
      limit: '1',
    });
  } catch (err) {
    console.error('OTP lookup failed:', err.message);
    return { valid: false, message: 'OTP expired or not found' };
  }

  const otpRecord = rows?.[0];
  if (!otpRecord) {
    return { valid: false, message: 'OTP expired or not found' };
  }

  const isMatch = await bcrypt.compare(submittedOTP.toString(), otpRecord.otp_code);
  if (!isMatch) {
    return { valid: false, message: 'Incorrect OTP' };
  }

  await pgrestPatch('otp_verifications', { id: `eq.${otpRecord.id}` }, { is_used: true });

  return { valid: true };
}

module.exports = { sendOTP, verifyOTP };
