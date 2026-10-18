const { sendWhatsAppText } = require('../utils/whatsappBot');

// WhatsApp messages telling a customer / salesman / driver where their
// account stands:
//   * pending  — right after they sign up (and, at most every few hours,
//                if they try to log in while still waiting);
//   * approved — the moment an admin approves them.
// Sent through the same WhatsApp bot as the OTPs, to the number on the
// account (a customer's own WhatsApp number if they gave a separate one).
//
// Fire-and-forget by design: a slow or down WhatsApp bot must never slow
// down or fail a signup/approval, so callers don't await these and every
// failure is only logged.

const ROLE_LABEL = { customer: 'customer', salesman: 'salesman', driver: 'driver' };
const SEND_TIMEOUT_MS = 20000;

const cleanName = (fullName) => String(fullName || '').trim();

function buildMessage(kind, role, fullName) {
  const name = cleanName(fullName);
  const hello = name ? `Hello ${name},` : 'Hello,';
  const label = ROLE_LABEL[role] || 'account';

  if (kind === 'approved') {
    return (
      '*RHR & Company*\n\n' +
      `${hello}\n` +
      `Your ${label} account is *approved* ✅\n` +
      'You can now log in to the RHR & Company app — your login code will come on this WhatsApp number.\n\n' +
      `Aap ka ${label} account approve ho gaya hai. Ab aap app mein login kar sakte hain.`
    );
  }
  return (
    '*RHR & Company*\n\n' +
    `${hello}\n` +
    `Your ${label} account is *pending* admin approval ⏳\n` +
    'We will message you here as soon as it is approved.\n\n' +
    `Aap ka ${label} account abhi pending hai. Approve hote hi aap ko isi number par message mil jayega.`
  );
}

// account: the row — needs full_name, phone and optionally whatsapp_phone.
function send(kind, role, account) {
  const to = account?.whatsapp_phone || account?.phone;
  if (!to) return;
  const message = buildMessage(kind, role, account.full_name);

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('WhatsApp send timed out')), SEND_TIMEOUT_MS));
  Promise.race([sendWhatsAppText(to, message), timeout])
    .catch((err) => console.error(`[account-status] ${kind} message to ${role} failed:`, err.message));
}

const notifyPending = (role, account) => send('pending', role, account);
const notifyApproved = (role, account) => send('approved', role, account);

// A pending person who keeps trying to log in shouldn't get the same
// message on every attempt — at most once per 6 hours per number. Kept in
// memory (a restart just allows one more message).
const REMIND_EVERY_MS = 6 * 60 * 60 * 1000;
const lastReminder = new Map();
function remindPending(role, account) {
  const key = String(account?.phone || '');
  if (!key) return;
  const last = lastReminder.get(key) || 0;
  if (Date.now() - last < REMIND_EVERY_MS) return;
  lastReminder.set(key, Date.now());
  notifyPending(role, account);
}

module.exports = { notifyPending, notifyApproved, remindPending, buildMessage };
