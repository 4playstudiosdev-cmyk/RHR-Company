const https = require('https');

// OpenStreetMap's free Nominatim API — no API key, no billing (same
// reasoning as the app's move away from Google Maps everywhere else).
// Usage policy requires a real identifying User-Agent and caps at ~1
// req/sec from a given client; both best-effort callers here (reverse
// geocode on shop-location save, search-as-you-type on the picker) are
// low-volume enough that this is never a concern in practice.
const USER_AGENT = 'RHR-Company-App/1.0 (https://rhr-company.vercel.app)';

function nominatimGet(path) {
  return new Promise((resolve) => {
    const req = https.get(`https://nominatim.openstreetmap.org${path}`, {
      headers: { 'User-Agent': USER_AGENT },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(6000, () => { req.destroy(); resolve(null); });
  });
}

// lat/lng -> human-readable address string, or null if the lookup fails.
// Always best-effort — never meant to block the caller's own save.
async function reverseGeocode(lat, lon) {
  const data = await nominatimGet(`/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=0&accept-language=en`);
  return data?.display_name || null;
}

// Free-text query -> up to 5 candidate {display_name, lat, lon} matches,
// biased toward Pakistan since that's this app's entire user base.
async function searchAddress(query) {
  const data = await nominatimGet(`/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=pk&accept-language=en`);
  if (!Array.isArray(data)) return [];
  return data.map((r) => ({
    display_name: r.display_name,
    latitude: Number(r.lat),
    longitude: Number(r.lon),
  }));
}

module.exports = { reverseGeocode, searchAddress };
