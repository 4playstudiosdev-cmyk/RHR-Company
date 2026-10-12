// Loads the Google Maps JavaScript API once and caches the promise so every
// page that needs a map (just GPS.js today) shares a single <script> tag
// instead of re-injecting it on every mount.
let loadPromise = null;

export function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const key = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    if (!key) {
      reject(new Error('Google Maps API key missing — set REACT_APP_GOOGLE_MAPS_API_KEY'));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=marker`;
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
