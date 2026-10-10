const bcrypt = require('bcryptjs');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');
const { sendWhatsAppText } = require('../utils/whatsappBot');

// OTPs are sent through the standalone RHR-whatsapp-bot service (separate
// Railway deployment, keeps its own WhatsApp session) instead of a
// whatsapp-web.js client running inside this backend.
const sendWhatsAppMessage = sendWhatsAppText;

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

// Per-IP limiting alone doesn't catch a phone that gets re-requested
// from a mobile connection that rotates IPs between taps (common on
// cellular carriers) — this caps it per phone number too, regardless
// of which IP the request comes from.
async function assertNotFlooded(phone) {
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  let recent;
  try {
    recent = await pgrestGet('otp_verifications', {
      select: 'id',
      phone: `eq.${phone}`,
      created_at: `gt.${windowStart}`,
    });
  } catch (err) {
    console.error('OTP flood-check warning:', err.message);
    return; // fail open — a DB hiccup here shouldn't block legitimate OTP sends
  }
  if ((recent?.length || 0) >= 5) {
    throw new Error('Too many OTP requests for this number. Try again in 15 minutes.');
  }
}

async function sendOTP(phoneNumber) {
  const phone     = normalizePhone(phoneNumber);
  await assertNotFlooded(phone);
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
