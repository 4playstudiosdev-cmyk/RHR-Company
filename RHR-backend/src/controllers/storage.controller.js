const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { BUCKET_RULES, LONG_LIVED_SIGN_SECONDS, uploadBase64ToStorage } = require('../utils/storageUpload');

// ══════════════════════════════════════════════
// POST /api/v1/storage/upload
// Upload a file — accepts base64 encoded content
// ══════════════════════════════════════════════
const uploadFile = async (req, res) => {
  try {
    const { bucket, fileName, fileBase64, mimeType } = req.body;

    if (!bucket || !fileName || !fileBase64 || !mimeType)
      return error(res, 'bucket, fileName, fileBase64, mimeType are required', 400);

    const result = await uploadBase64ToStorage({
      bucket, fileName, fileBase64, mimeType, companyId: req.user.company_id,
    });

    return success(res, result, 'File uploaded successfully', 201);
  } catch (err) {
    return error(res, err.message);
  }
};

// ══════════════════════════════════════════════
// GET /api/v1/storage/signed-url
// Generate a signed URL for a private file
// ══════════════════════════════════════════════
const getSignedUrl = async (req, res) => {
  try {
    const { bucket, path: filePath } = req.query;

    if (!bucket || !filePath)
      return error(res, 'bucket and path query params are required', 400);

    const rules = BUCKET_RULES[bucket];
    if (!rules)
      return error(res, 'Invalid bucket', 400);

    if (rules.isPublic) {
      const { data } = supabaseAdmin.storage
        .from(bucket)
        .getPublicUrl(filePath);
      return success(res, { url: data.publicUrl, expiresIn: 'permanent' });
    }

    const { data, error: signError } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(filePath, LONG_LIVED_SIGN_SECONDS);

    if (signError) throw new Error(signError.message);

    return success(res, {
      url:       data.signedUrl,
      expiresIn: '10 years'
    }, 'Signed URL generated');

  } catch (err) {
    return error(res, err.message);
  }
};

// ══════════════════════════════════════════════
// DELETE /api/v1/storage/file
// Delete a file from storage — admin only
// ══════════════════════════════════════════════
const deleteFile = async (req, res) => {
  try {
    const { bucket, path: filePath } = req.body;

    if (!bucket || !filePath)
      return error(res, 'bucket and path are required', 400);

    if (!BUCKET_RULES[bucket])
      return error(res, 'Invalid bucket', 400);

    const companyId = req.user.company_id;
    if (!filePath.startsWith(companyId) && req.user.role !== 'super_admin')
      return error(res, 'Access denied — file belongs to different branch', 403);

    const { error: deleteError } = await supabaseAdmin.storage
      .from(bucket)
      .remove([filePath]);

    if (deleteError) throw new Error(deleteError.message);

    return success(res, { deleted: true, path: filePath }, 'File deleted');

  } catch (err) {
    return error(res, err.message);
  }
};

// ══════════════════════════════════════════════
// GET /api/v1/storage/files
// List files in a bucket — admin only
// ══════════════════════════════════════════════
const listFiles = async (req, res) => {
  try {
    const { bucket } = req.query;

    if (!bucket || !BUCKET_RULES[bucket])
      return error(res, 'Valid bucket query param is required', 400);

    const companyId = req.user.role === 'super_admin'
      ? ''
      : req.user.company_id;

    const { data, error: listError } = await supabaseAdmin.storage
      .from(bucket)
      .list(companyId, {
        limit:  100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (listError) throw new Error(listError.message);

    return success(res, data, `Files in ${bucket}`);

  } catch (err) {
    return error(res, err.message);
  }
};

module.exports = { uploadFile, getSignedUrl, deleteFile, listFiles };
