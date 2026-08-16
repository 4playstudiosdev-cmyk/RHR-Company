const admin = require('firebase-admin');

let app = null;

// Lazily initialize — safe to call repeatedly, no-op if already initialized
function initFirebase() {
  if (app) return app;

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    console.warn('⚠️  Firebase not configured — push notifications disabled');
    return null;
  }

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey:  FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });

  console.log('✅ Firebase initialized');
  return app;
}

async function sendPushNotification(token, { title, body, data = {} }) {
  const firebaseApp = initFirebase();
  if (!firebaseApp) return { sent: false, reason: 'Firebase not configured' };

  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
    });
    return { sent: true };
  } catch (err) {
    console.error('Push notification failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { initFirebase, sendPushNotification };
