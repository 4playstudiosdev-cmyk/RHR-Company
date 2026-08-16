const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../../assets/firebase-service-account.json');
let messagingClient = null;
let firebaseInitAttempted = false;

// Lazy, optional Firebase init — push notifications are a bonus on top of
// the DB-backed notifications feature, not a requirement for it to work.
// Skips silently if the service account file isn't there yet.
function getMessagingClient() {
  if (firebaseInitAttempted) return messagingClient;
  firebaseInitAttempted = true;

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.warn('⚠️  Firebase service account not found — push notifications disabled (notifications still save to the DB)');
    return null;
  }

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

// POST /api/v1/notifications/send
const sendNotification = async (req, res) => {
  try {
    const { title, body, recipient_id, recipient_role, type } = req.body;

    if (!title || !body) return error(res, 'title and body are required', 400);

    // Save to notifications table
    await supabaseAdmin.from('notifications').insert({
      company_id:     req.user.company_id,
      recipient_id:   recipient_id   || null,
      recipient_role: recipient_role || null,
      title,
      body,
      type: type || 'broadcast'
    });

    // Get FCM tokens — salesmen live in a separate table now, so a
    // recipient could be in either `users` or `salesmen`.
    let tokens = [];
    if (recipient_id) {
      const [{ data: u }, { data: s }] = await Promise.all([
        supabaseAdmin.from('users').select('fcm_token').eq('id', recipient_id).not('fcm_token', 'is', null),
        supabaseAdmin.from('salesmen').select('fcm_token').eq('id', recipient_id).not('fcm_token', 'is', null)
      ]);
      tokens = [...(u || []), ...(s || [])].map(row => row.fcm_token).filter(Boolean);
    } else if (recipient_role === 'salesman') {
      const { data: s } = await supabaseAdmin
        .from('salesmen')
        .select('fcm_token')
        .eq('company_id', req.user.company_id)
        .not('fcm_token', 'is', null);
      tokens = (s || []).map(row => row.fcm_token).filter(Boolean);
    } else if (recipient_role) {
      const { data: u } = await supabaseAdmin
        .from('users')
        .select('fcm_token')
        .eq('company_id', req.user.company_id)
        .eq('role', recipient_role)
        .not('fcm_token', 'is', null);
      tokens = (u || []).map(row => row.fcm_token).filter(Boolean);
    } else {
      // Broadcast to everyone in the company — both tables
      const [{ data: u }, { data: s }] = await Promise.all([
        supabaseAdmin.from('users').select('fcm_token').eq('company_id', req.user.company_id).not('fcm_token', 'is', null),
        supabaseAdmin.from('salesmen').select('fcm_token').eq('company_id', req.user.company_id).not('fcm_token', 'is', null)
      ]);
      tokens = [...(u || []), ...(s || [])].map(row => row.fcm_token).filter(Boolean);
    }

    const messaging = tokens.length > 0 ? getMessagingClient() : null;
    if (messaging) {
      await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: { type: type || 'broadcast' }
      });
    }

    return success(res, { sent_to: tokens.length }, `Notification sent to ${tokens.length} devices`);
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/notifications
// User sees their own notifications
const getMyNotifications = async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .or(`recipient_id.eq.${req.user.id},recipient_role.eq.${req.user.role}`)
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

module.exports = { sendNotification, getMyNotifications };
