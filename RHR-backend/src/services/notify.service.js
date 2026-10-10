const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../config/supabase');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../../assets/firebase-service-account.json');
let messagingClient = null;
let firebaseInitAttempted = false;

// Same lazy/optional init as notifications.controller.js's
// getMessagingClient — duplicated rather than imported to keep this
// module usable from anywhere without pulling in Express req/res.
function getMessagingClient() {
  if (firebaseInitAttempted) return messagingClient;
  firebaseInitAttempted = true;

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) return null;

  try {
    const { initializeApp, cert, getApps } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);
    const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
    messagingClient = getMessaging(app);
  } catch (err) {
    console.warn('⚠️  Firebase init failed — push notifications disabled:', err.message);
  }

  return messagingClient;
}

// Saves a notification row for one specific user and pushes it via FCM
// if they have a token on file. Best-effort — a failure here (bad token,
// Firebase down, DB hiccup) must never block the caller's main action
// (e.g. a payment being recorded), so this never throws.
async function notifyUser({ companyId, recipientId, title, body, type }) {
  try {
    await supabaseAdmin.from('notifications').insert({
      company_id:   companyId,
      recipient_id: recipientId,
      title,
      body,
      type: type || 'payment',
    });

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('fcm_token')
      .eq('id', recipientId)
      .not('fcm_token', 'is', null)
      .maybeSingle();

    const token = user?.fcm_token;
    if (!token) return;

    const messaging = getMessagingClient();
    if (!messaging) return;

    await messaging.send({ token, notification: { title, body }, data: { type: type || 'payment' } });
  } catch (err) {
    console.error('[notifyUser] failed:', err.message);
  }
}

module.exports = { notifyUser };
