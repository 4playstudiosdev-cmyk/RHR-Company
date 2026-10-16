// Single source of truth for Pakistani phone normalization — this used to
// be copy-pasted (with a subtle but critical bug) across
// customers.controller.js, auth.service.js, and otp.service.js. The bug:
// each copy only converted a leading '0' to '92' and left anything else
// untouched, so a bare 10-digit local number with no leading 0 (e.g. an
// admin typing "3212211069" into the Add Customer form instead of
// "03212211069") normalized to "+3212211069" instead of "+923212211069".
// That meant an admin-created customer and that same person's own
// self-registered account (via the app, which always sends a correctly
// '0'-prefixed number) stored under two different-looking phone values
// and never matched as duplicates — see the "Rehman office" x2 rows this
// fix was written to stop recurring.
//
// normalizePhone() now handles every input shape a human or the app
// might produce: '03XXXXXXXXX', '3XXXXXXXXX', '923XXXXXXXXX',
// '+923XXXXXXXXX' — all converge on '+923XXXXXXXXX'.
function normalizePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '92' + digits.slice(1);
  else if (!digits.startsWith('92')) digits = '92' + digits;
  return '+' + digits;
}

// Same normalization, without the leading '+' — otp_verifications stores
// phone this way.
function normalizePhoneBare(phone) {
  return normalizePhone(phone).replace('+', '');
}

// The last 10 digits (the actual subscriber number, country-code-free)
// — used as a defense-in-depth duplicate check that still catches a
// match even if some other caller ever produces a differently-shaped
// phone string than normalizePhone would.
function phoneLast10(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

module.exports = { normalizePhone, normalizePhoneBare, phoneLast10 };
