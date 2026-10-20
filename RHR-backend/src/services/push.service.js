const fs = require('fs');
const path = require('path');
const { pgrestGet, pgrestPatch } = require('../utils/directQuery');

// Push notifications to the phones (Firebase Cloud Messaging) — what shows up
// in the notification bar even when the app is closed. Notifications are
// always saved to the database first (that is the real record); this only adds
// the phone ping, and is strictly best-effort: if Firebase isn't set up, or a
// token is stale, nothing here ever throws or blocks the caller.
//
// Firebase credentials (a service-account key), first one found wins:
//   1. FIREBASE_SERVICE_ACCOUNT_JSON    — the key's JSON, pasted as a Railway variable
//   2. FIREBASE_SERVICE_ACCOUNT_BASE64  — the same JSON, base64-encoded
//   3. assets/firebase-service-account.json (local use; git-ignored)

const FILE_PATH = path.join(__dirname, '../../assets/firebase-service-account.json');
const TOKEN_TABLES = ['users', 'salesmen', 'drivers'];

let client = null;
let attempted = false;

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
  }
  if (fs.existsSync(FILE_PATH)) return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  return null;
}

function getMessagingClient() {
  if (attempted) return client;
  attempted = true;
  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      console.warn('⚠️  Firebase service account not configured — phone push notifications are off (notifications still save to the app/database)');
      return null;
    }
    const { initializeApp, cert, getApps } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
    client = getMessaging(app);
    console.log('✅ Firebase push notifications ready (project:', serviceAccount.project_id + ')');
  } catch (err) {
    console.warn('⚠️  Firebase init failed — push notifications disabled:', err.message);
  }
  return client;
}

// Every device token registered for one account, wherever that account lives.
async function tokensFor(accountId) {
  const found = [];
  for (const table of TOKEN_TABLES) {
    try {
      const rows = await pgrestGet(table, { select: 'fcm_token', id: `eq.${accountId}`, fcm_token: 'not.is.null' });
      (rows || []).forEach((r) => r.fcm_token && found.push(r.fcm_token));
    } catch (e) { /* that table may not carry the column yet */ }
  }
  return [...new Set(found)];
}

// A token Firebase says no longer exists (app uninstalled / data cleared) is
// dropped so we stop sending to it.
async function forgetToken(token) {
  for (const table of TOKEN_TABLES) {
    try { await pgrestPatch(table, { fcm_token: `eq.${token}` }, { fcm_token: null }); } catch (e) { /* ignore */ }
  }
}

// data values must be strings for FCM.
const stringify = (data = {}) => Object.fromEntries(Object.entries(data)
  .filter(([, v]) => v !== undefined && v !== null)
  .map(([k, v]) => [k, String(v)]));

async function sendToTokens(tokens, { title, body, data }) {
  const messaging = tokens.length ? getMessagingClient() : null;
  if (!messaging) return { sent: 0 };
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: stringify(data),
    android: { priority: 'high', notification: { channelId: 'rhr_default', sound: 'default' } },
  });
  await Promise.all(res.responses.map((r, i) => {
    const code = r.error?.code;
    return (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')
      ? forgetToken(tokens[i]) : null;
  }));
  return { sent: res.successCount, failed: res.failureCount };
}

// Push to one account (customer / salesman / driver / admin).
async function pushToAccount(accountId, payload) {
  try {
    return await sendToTokens(await tokensFor(accountId), payload);
  } catch (err) {
    console.error('[push] failed:', err.message);
    return { sent: 0 };
  }
}

module.exports = { getMessagingClient, tokensFor, sendToTokens, pushToAccount };
