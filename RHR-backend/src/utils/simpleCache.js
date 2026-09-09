// Tiny in-process TTL cache. Railway runs this service as a single
// instance (numReplicas: 1), so there's no cross-instance invalidation
// to worry about — a plain in-memory Map is safe and consistent.
//
// Built specifically for raw_materials/production_bom reads — the two
// endpoints most exposed to the documented Railway<->Supabase egress
// blip (see withRetry.js). Serving repeat loads from memory sidesteps
// that blip entirely instead of retrying into it on every request.
//
// Only ever cache a non-empty result (see callers) — caching an empty
// result from a blip would "cache the bug" and keep showing empty for
// the full TTL even once the underlying data is fine again.
const store = new Map();

function getCached(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

module.exports = { getCached, setCached, invalidate };
