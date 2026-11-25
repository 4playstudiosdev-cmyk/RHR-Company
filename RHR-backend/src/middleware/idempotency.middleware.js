// The mobile app saves orders / payments / visits / new customers on the phone
// when there is no internet and sends them later. Each such item carries its own
// id in the `X-Client-Ref` header. If a send timed out after we had already
// saved it, the app sends it again with the same id — this replays the first
// answer instead of saving a duplicate.
//
// Kept in memory for 48 h (plenty for a retry; a server restart in between is
// the one case it can't cover).
const crypto = require('crypto');

const TTL_MS = 48 * 60 * 60 * 1000;
const MAX_ENTRIES = 20000;
const seen = new Map(); // key -> { at, pending } | { at, status, body }

function prune() {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of seen) {
    if (v.at < cutoff || seen.size > MAX_ENTRIES) seen.delete(k);
    else break; // Map keeps insertion order — the rest are newer
  }
}

module.exports = function idempotency(req, res, next) {
  const ref = req.get('x-client-ref');
  if (!ref || req.method !== 'POST' || ref.length > 100) return next();

  // Per login: the same ref from a different account is a different item.
  const who = crypto.createHash('sha1').update(req.get('authorization') || '').digest('hex').slice(0, 16);
  const key = `${who}:${req.path}:${ref}`;
  prune();

  const hit = seen.get(key);
  if (hit && hit.body !== undefined) {
    res.set('X-Idempotent-Replay', 'true');
    return res.status(hit.status).json(hit.body);
  }
  if (hit && hit.pending) {
    return res.status(409).json({ success: false, message: 'This item is already being saved — it will be confirmed shortly.' });
  }

  seen.set(key, { at: Date.now(), pending: true });
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400 && body && body.success !== false) seen.set(key, { at: Date.now(), status: res.statusCode, body });
    else seen.delete(key); // refused — a corrected resend must be processed
    return json(body);
  };
  res.on('close', () => { const h = seen.get(key); if (h && h.pending) seen.delete(key); });
  next();
};
