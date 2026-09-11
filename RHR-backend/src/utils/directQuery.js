const https = require('https');

// Bypasses @supabase/supabase-js entirely for reads that need it. Proved via
// a raw-https diagnostic probe that supabase-js's own HTTP client silently
// drops the body on some fraction of requests when running on Railway —
// status 200, correct headers, but an empty array is returned to calling
// code — while an identical raw https request against the exact same
// PostgREST endpoint, at the exact same moment, always returns the full,
// correct result. Root cause looks like a supabase-js/underlying fetch
// issue specific to Railway's runtime handling this API's
// transfer-encoding: chunked responses; unresolved upstream, so this
// sidesteps it for the two endpoints that were hit hardest by it
// (raw_materials, production_bom).
// table: e.g. 'raw_materials'. params: plain object of PostgREST query
// params — e.g. { select: '*', company_id: 'eq.<uuid>', order: 'name.asc' }.
// Each full value (operator prefix included, e.g. 'eq.xyz') is
// percent-encoded as one unit, matching what PostgREST expects.
function pgrestGet(table, params) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return pgrestGetRaw(`${table}?${qs}`);
}

function pgrestGetRaw(pathAndQuery) {
  return new Promise((resolve, reject) => {
    const url = `${process.env.SUPABASE_URL}/rest/v1/${pathAndQuery}`;
    const req = https.get(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`PostgREST ${res.statusCode}: ${body}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`PostgREST returned non-JSON body: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('PostgREST request timed out')); });
  });
}

// Same bypass, for writes. Confirmed the same Railway-only divergence
// extends to POST/insert, not just GET/read: an insert that fails on
// Railway via supabase-js (RLS/permission error) succeeds immediately
// when run locally against the exact same table, same moment, same
// service-role key. body: plain object, inserted as one row unless an
// array is passed.
function pgrestPost(table, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = `${process.env.SUPABASE_URL}/rest/v1/${table}`;
    const req = https.request(url, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let respBody = '';
      res.on('data', (chunk) => { respBody += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`PostgREST ${res.statusCode}: ${respBody}`));
        }
        try {
          resolve(respBody ? JSON.parse(respBody) : null);
        } catch (e) {
          reject(new Error(`PostgREST returned non-JSON body: ${respBody.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('PostgREST request timed out')); });
    req.write(payload);
    req.end();
  });
}

// Same bypass, for updates. table: e.g. 'users'. params: PostgREST filter
// query params identifying the row(s), e.g. { id: 'eq.<uuid>' } — required,
// since an unfiltered PATCH would update every row in the table. body: the
// fields to change.
function pgrestPatch(table, params, body) {
  return new Promise((resolve, reject) => {
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const payload = JSON.stringify(body);
    const url = `${process.env.SUPABASE_URL}/rest/v1/${table}?${qs}`;
    const req = https.request(url, {
      method: 'PATCH',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let respBody = '';
      res.on('data', (chunk) => { respBody += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`PostgREST ${res.statusCode}: ${respBody}`));
        }
        try {
          resolve(respBody ? JSON.parse(respBody) : null);
        } catch (e) {
          reject(new Error(`PostgREST returned non-JSON body: ${respBody.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('PostgREST request timed out')); });
    req.write(payload);
    req.end();
  });
}

module.exports = { pgrestGet, pgrestGetRaw, pgrestPost, pgrestPatch };
