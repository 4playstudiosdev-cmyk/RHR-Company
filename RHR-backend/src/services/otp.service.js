const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../config/supabase');
const { sendWhatsAppMessage } = require('../config/whatsapp');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ⚠️ TEMP — GUEST TESTING BYPASS. Remove this block (and the matching
// customer/salesmen/drivers rows for the three phones below) before the
// real production launch — it exists only so testers can open the full
// app, in any of the three roles, without waiting on a real WhatsApp OTP.
// Scoped to exactly these fixed phone+code pairs; every other number
// still goes through the real bcrypt-checked OTP record.
const GUEST_ACCOUNTS = {
  '923000000000': '999999', // customer
  '923000000001': '999998', // salesman
  '923000000002': '999997', // driver
};

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
  const { error: invalidateError } = await supabaseAdmin
    .from('otp_verifications')
    .update({ is_used: true })
    .eq('phone', phone)
    .eq('is_used', false);

  if (invalidateError) {
    console.error('OTP invalidate warning:', invalidateError.message);
  }

  // Insert new OTP
  const { error: insertError } = await supabaseAdmin
    .from('otp_verifications')
    .insert({
      phone:      phone,
      otp_code:   hashedOTP,
      is_used:    false,
      expires_at: expiresAt.toISOString()
    });

  if (insertError) {
    console.error('OTP insert failed:', insertError);
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

  // ⚠️ TEMP guest bypass — see GUEST_ACCOUNTS comment above.
  if (GUEST_ACCOUNTS[phone] && submittedOTP.toString() === GUEST_ACCOUNTS[phone]) {
    return { valid: true };
  }

  console.log('=== OTP VERIFY DEBUG ===');
  console.log('Raw phone:', phoneNumber);
  console.log('Normalized phone:', phone);
  console.log('Submitted OTP:', submittedOTP);
  console.log('OTP type:', typeof submittedOTP);
  console.log('========================');

  const { data: otpRecord, error } = await supabaseAdmin
    .from('otp_verifications')
    .select('*')
    .eq('phone', phone)
    .eq('is_used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('OTP Record found:', otpRecord ? 'YES' : 'NO');
  console.log('DB Error:', error);

  if (error || !otpRecord) {
    return { valid: false, message: 'OTP expired or not found' };
  }

  const isMatch = await bcrypt.compare(submittedOTP.toString(), otpRecord.otp_code);
  console.log('OTP Match:', isMatch);

  if (!isMatch) {
    return { valid: false, message: 'Incorrect OTP' };
  }

  await supabaseAdmin
    .from('otp_verifications')
    .update({ is_used: true })
    .eq('id', otpRecord.id);

  return { valid: true };
}

module.exports = { sendOTP, verifyOTP };
