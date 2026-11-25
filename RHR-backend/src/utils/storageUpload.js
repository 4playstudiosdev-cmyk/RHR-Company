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

// Phone cameras give 2–4 MB photos; the app shows them a few hundred pixels wide.
// Every image upload is shrunk to at most this many pixels on the long side and
// re-encoded (JPEG, or PNG when it really has transparency) — typically 2 MB → 50–80 KB.
// Documents (NIC, payment proof, receipts) keep more pixels so the text stays readable.
const MAX_IMAGE_SIDE = {
  'product-images': 1000, 'profile-photos': 800, 'shop-photos': 1200, 'promo-banners': 1600,
  'nic-images': 1600, 'payment-proofs': 1600, 'expense-receipts': 1600,
};
let sharp = null;
try { sharp = require('sharp'); } catch (_) { /* not installed — upload originals */ }

async function optimiseImage(buffer, mimeType, bucket) {
  const maxSide = MAX_IMAGE_SIDE[bucket];
  if (!sharp || !maxSide || !/^image\/(jpeg|png|webp)$/.test(mimeType)) return null;
  try {
    const img = sharp(buffer, { failOn: 'none' }).rotate(); // apply camera orientation
    const meta = await img.metadata();
    const transparent = meta.hasAlpha ? !(await sharp(buffer, { failOn: 'none' }).stats()).isOpaque : false;
    const resized = img.resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true });
    const doc = maxSide >= 1600;
    const out = transparent
      ? { buffer: await resized.png({ palette: true, quality: 85, compressionLevel: 9 }).toBuffer(), mimeType: 'image/png', ext: 'png' }
      : { buffer: await resized.flatten({ background: '#ffffff' }).jpeg({ quality: doc ? 82 : 78, mozjpeg: true }).toBuffer(), mimeType: 'image/jpeg', ext: 'jpg' };
    return out.buffer.length < buffer.length ? out : null;
  } catch (_) { return null; } // unreadable image — keep the original
}

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
  let safeName  = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Shrink camera photos before storing them (see optimiseImage).
  let body = fileBuffer;
  let contentType = mimeType;
  const optimised = await optimiseImage(fileBuffer, mimeType, bucket);
  if (optimised) {
    body = optimised.buffer;
    contentType = optimised.mimeType;
    safeName = `${safeName.replace(/\.[a-zA-Z0-9]{2,5}$/, '')}.${optimised.ext}`;
  }
  const filePath  = `${companyId || 'unassigned'}/${timestamp}_${safeName}`;

  const storageClient = freshStorageClient();
  // File names are unique (timestamped) and never overwritten, so phones may keep them for a year.
  const uploadOpts = { contentType, upsert: false, cacheControl: '31536000' };

  let { error: uploadError } = await storageClient.storage
    .from(bucket)
    .upload(filePath, body, uploadOpts);

  // Every other bucket here was created once by hand in the Supabase
  // dashboard — a newly-added bucket (like promo-banners) hasn't been,
  // so the very first upload to it 404s. Create it on demand and retry
  // once rather than requiring a manual dashboard step before this
  // feature can be used at all.
  if (uploadError && /bucket.*not.*found/i.test(uploadError.message || '')) {
    await storageClient.storage.createBucket(bucket, { public: rules.isPublic });
    ({ error: uploadError } = await storageClient.storage
      .from(bucket)
      .upload(filePath, body, uploadOpts));
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

  return { url: fileUrl, path: filePath, bucket, sizeMB: (body.length / (1024 * 1024)).toFixed(2), originalSizeMB: fileSizeMB.toFixed(2), isPublic: rules.isPublic };
}

module.exports = { BUCKET_RULES, LONG_LIVED_SIGN_SECONDS, uploadBase64ToStorage, freshStorageClient };
