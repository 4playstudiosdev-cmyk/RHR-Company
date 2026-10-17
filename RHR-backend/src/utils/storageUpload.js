const { createClient } = require('@supabase/supabase-js');

// Storage uploads specifically (not the regular Postgres-backed
// supabaseAdmin reads/writes everywhere else in this codebase) have been
// observed failing with "new row violates row-level security policy" —
// even though the exact same service-role key succeeds every time both
// from a brand-new process and via a raw HTTP call straight to
// Supabase's Storage API, which rules out the key or an actual RLS
// policy. The one thing that reliably reproduces it is reusing the
// long-lived supabaseAdmin singleton after the server's been running a
// while; a fresh client fixes it every time (confirmed by redeploying
// restoring it). Likely a stale/reused keep-alive connection through
// Cloudflare (Supabase sits behind it — see config/supabase.js's own
// comment on this) getting into a bad state that the Storage API's
// server-side auth check trips on. Minting one short-lived client just
// for the upload call sidesteps whatever that connection-level issue is,
// instead of needing a full server restart to clear it.
function freshStorageClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' } },
  });
}

// ── ALLOWED FILE TYPES PER BUCKET ── shared between storage.controller.js
// (authenticated client uploads) and auth.service.js's registerCustomer
// (server-side uploads during signup, before any JWT exists).
const BUCKET_RULES = {
  'product-images': {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeMB: 10,
    isPublic: true
  },
  'payment-proofs': {
    allowedTypes: ['image/jpeg', 'image/png'],
    maxSizeMB: 12,
    isPublic: false
  },
  'invoices': {
    allowedTypes: ['application/pdf'],
    maxSizeMB: 5,
    isPublic: false
  },
  'profile-photos': {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeMB: 5,
    isPublic: true
  },
  'nic-images': {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeMB: 5,
    isPublic: false
  },
  'shop-photos': {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeMB: 5,
    isPublic: true
  },
  'money-receipts': {
    allowedTypes: ['application/pdf'],
    maxSizeMB: 5,
    isPublic: true
  },
  // Photo of a bill / receipt attached to an expense. Private — viewed
  // through the long-lived signed URL stored on the expense row.
  'expense-receipts': {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeMB: 10,
    isPublic: false
  },
  'promo-banners': {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
    maxSizeMB: 50,
    isPublic: true
  }
};

// A link to a private-bucket file meant to be stored in a DB column and
// reused indefinitely (profile_photo_url, nic_image_url, ...) can't be a
// 1-hour signed URL — it'll silently stop working an hour after upload.
// 10 years is effectively permanent for this app's lifetime.
const LONG_LIVED_SIGN_SECONDS = 60 * 60 * 24 * 365 * 10;

async function uploadBase64ToStorage({ bucket, fileName, fileBase64, mimeType, companyId }) {
  const rules = BUCKET_RULES[bucket];
  if (!rules) throw new Error(`Invalid bucket. Allowed: ${Object.keys(BUCKET_RULES).join(', ')}`);
  if (!rules.allowedTypes.includes(mimeType))
    throw new Error(`Invalid file type for ${bucket}. Allowed: ${rules.allowedTypes.join(', ')}`);

  const fileBuffer = Buffer.from(fileBase64, 'base64');
  const fileSizeMB = fileBuffer.length / (1024 * 1024);
  if (fileSizeMB > rules.maxSizeMB)
    throw new Error(`File too large. Max size for ${bucket}: ${rules.maxSizeMB}MB`);

  const timestamp = Date.now();
  const safeName  = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath  = `${companyId || 'unassigned'}/${timestamp}_${safeName}`;

  const storageClient = freshStorageClient();

  let { error: uploadError } = await storageClient.storage
    .from(bucket)
    .upload(filePath, fileBuffer, { contentType: mimeType, upsert: false });

  // Every other bucket here was created once by hand in the Supabase
  // dashboard — a newly-added bucket (like promo-banners) hasn't been,
  // so the very first upload to it 404s. Create it on demand and retry
  // once rather than requiring a manual dashboard step before this
  // feature can be used at all.
  if (uploadError && /bucket.*not.*found/i.test(uploadError.message || '')) {
    await storageClient.storage.createBucket(bucket, { public: rules.isPublic });
    ({ error: uploadError } = await storageClient.storage
      .from(bucket)
      .upload(filePath, fileBuffer, { contentType: mimeType, upsert: false }));
  }
  if (uploadError) throw new Error(uploadError.message);

  let fileUrl;
  if (rules.isPublic) {
    const { data: urlData } = storageClient.storage.from(bucket).getPublicUrl(filePath);
    fileUrl = urlData.publicUrl;
  } else {
    const { data: urlData, error: signError } = await storageClient.storage
      .from(bucket)
      .createSignedUrl(filePath, LONG_LIVED_SIGN_SECONDS);
    if (signError) throw new Error(signError.message);
    fileUrl = urlData.signedUrl;
  }

  return { url: fileUrl, path: filePath, bucket, sizeMB: fileSizeMB.toFixed(2), isPublic: rules.isPublic };
}

module.exports = { BUCKET_RULES, LONG_LIVED_SIGN_SECONDS, uploadBase64ToStorage, freshStorageClient };
