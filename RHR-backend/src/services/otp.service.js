const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../config/supabase');
const { sendWhatsAppMessage } = require('../config/whatsapp');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTP(phoneNumber) {
  const otp       = generateOTP();
  const expiryMin = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
  const expiresAt = new Date(Date.now() + expiryMin * 60 * 1000);

  const hashedOTP = await bcrypt.hash(otp, 10);

  // Invalidate existing unused OTPs for this phone
  const { error: invalidateError } = await supabaseAdmin
    .from('otp_verifications')
    .update({ is_used: true })
    .eq('phone', phoneNumber)
    .eq('is_used', false);

  if (invalidateError) {
    console.error('OTP invalidate warning:', invalidateError.message);
  }

  // Insert new OTP — log real error if it fails
  const { error: insertError } = await supabaseAdmin
    .from('otp_verifications')
    .insert({
      phone:      phoneNumber,
      otp_code:   hashedOTP,
      is_used:    false,
      expires_at: expiresAt.toISOString()
    });

  if (insertError) {
    console.error('OTP insert failed:', insertError);
    throw new Error('OTP DB error: ' + insertError.message);
  }

  // Send via WhatsApp
  const message =
    '*RHR & Company Verification*\n\n' +
    'Your OTP code is: *' + otp + '*\n\n' +
    'This code expires in ' + expiryMin + ' minutes.\n' +
    'Do not share this code with anyone.';

  await sendWhatsAppMessage(phoneNumber, message);

  return { sent: true, expiresAt };
}

async function verifyOTP(phoneNumber, submittedOTP) {
  const { data: otpRecord, error } = await supabaseAdmin
    .from('otp_verifications')
    .select('*')
    .eq('phone', phoneNumber)
    .eq('is_used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !otpRecord) {
    return { valid: false, message: 'OTP expired or not found' };
  }

  const isMatch = await bcrypt.compare(submittedOTP, otpRecord.otp_code);
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
