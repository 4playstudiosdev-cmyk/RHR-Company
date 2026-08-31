// Shared helpers for a class of transient Railway<->Supabase network blips
// this project has repeatedly hit — confirmed (many times, across several
// different endpoints) by comparing the exact same query run locally
// (always succeeds) against the exact same query run from Railway
// (sometimes fails/returns wrong data, no consistent per-request pattern).
// A short delay + one retry reliably papers over it without masking a
// real, persistent failure (which will still fail on every attempt).

// For calls that throw on failure (e.g. .single()/.signInWithPassword()
// rejecting) — retries on the thrown error.
async function withRetry(fn, attempts = 2, delayMs = 400) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// For calls that "succeed" (no thrown error, no dbErr) but silently come
// back with an empty array when the blip corrupts the request — e.g. a
// PostgREST query with a long embedded-resource `select=` string appears
// to be especially exposed to this on Railway's egress path. Retries
// while the array stays empty; the last result (even if still empty) is
// returned rather than thrown, since an empty result can also just be
// genuinely correct.
async function retryIfEmpty(fn, attempts = 2, delayMs = 400) {
  let result;
  for (let i = 0; i < attempts; i++) {
    result = await fn();
    if (Array.isArray(result) && result.length > 0) return result;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return result;
}

module.exports = { withRetry, retryIfEmpty };
