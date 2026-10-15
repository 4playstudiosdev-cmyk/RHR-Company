const { supabaseAdmin } = require('../config/supabase');

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

  let { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(filePath, fileBuffer, { contentType: mimeType, upsert: false });

  // Every other bucket here was created once by hand in the Supabase
  // dashboard — a newly-added bucket (like promo-banners) hasn't been,
  // so the very first upload to it 404s. Create it on demand and retry
  // once rather than requiring a manual dashboard step before this
  // feature can be used at all.
  if (uploadError && /bucket.*not.*found/i.test(uploadError.message || '')) {
    await supabaseAdmin.storage.createBucket(bucket, { public: rules.isPublic });
    ({ error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(filePath, fileBuffer, { contentType: mimeType, upsert: false }));
  }
  if (uploadError) throw new Error(uploadError.message);

  let fileUrl;
  if (rules.isPublic) {
    const { data: urlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath);
    fileUrl = urlData.publicUrl;
  } else {
    const { data: urlData, error: signError } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(filePath, LONG_LIVED_SIGN_SECONDS);
    if (signError) throw new Error(signError.message);
    fileUrl = urlData.signedUrl;
  }

  return { url: fileUrl, path: filePath, bucket, sizeMB: fileSizeMB.toFixed(2), isPublic: rules.isPublic };
}

module.exports = { BUCKET_RULES, LONG_LIVED_SIGN_SECONDS, uploadBase64ToStorage };
