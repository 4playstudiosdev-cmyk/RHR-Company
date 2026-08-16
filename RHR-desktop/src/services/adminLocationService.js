import api from './api';

const INTERVAL_MS = 2 * 60 * 1000; // 2 min — same cadence as the salesman app

let timer = null;

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not available — this browser/window has no navigator.geolocation.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000
    });
  });
}

// Does the actual work and either returns the position or throws with a
// specific, human-readable reason — callers decide whether to surface it.
async function pingOnce() {
  let pos;
  try {
    pos = await getCurrentPosition();
  } catch (err) {
    // GeolocationPositionError has a numeric `code`, not always a useful `message`
    const reasons = {
      1: 'Location permission was denied for this page — check the site permissions (padlock icon) for this exact URL.',
      2: 'Position unavailable — check that Windows Location Services is turned on.',
      3: 'Location request timed out.'
    };
    throw new Error(reasons[err.code] || err.message || 'Could not read location');
  }

  const res = await api.post('/admin-location/ping', {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    status: 'active'
  });
  return res.data.data;
}

async function sendPing() {
  try {
    await pingOnce();
  } catch (err) {
    // Non-fatal in the background — admin location is a bonus feature, not
    // something that should ever interrupt normal desktop app use.
    console.warn('Admin location ping failed:', err.message);
  }
}

const AdminLocationService = {
  start() {
    if (timer) return;
    sendPing();
    timer = setInterval(sendPing, INTERVAL_MS);
  },
  stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  },
  // For a manual "Update Now" button — throws so the UI can show the real reason.
  pingNow() {
    return pingOnce();
  }
};

export default AdminLocationService;
