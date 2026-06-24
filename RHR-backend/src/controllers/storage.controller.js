const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// Accepts base64 encoded file from Flutter app
const uploadFile = async (req, res) => {
  try {
    const { bucket, fileName, fileBase64, mimeType } = req.body;

    if (!bucket || !fileName || !fileBase64 || !mimeType)
      return error(res, 'bucket, fileName, fileBase64, mimeType are required', 400);

    const validBuckets = ['product-images', 'payment-proofs', 'invoices'];
    if (!validBuckets.includes(bucket))
      return error(res, 'Invalid bucket name', 400);

    // Convert base64 to buffer
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const filePath   = `${req.user.company_id}/${Date.now()}_${fileName}`;

    const { data, error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) throw new Error(uploadError.message);

    // Public URL for product-images, signed URL for private buckets
    let fileUrl;
    if (bucket === 'product-images') {
      const { data: urlData } = supabaseAdmin.storage
        .from(bucket)
        .getPublicUrl(filePath);
      fileUrl = urlData.publicUrl;
    } else {
      const { data: urlData } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days
      fileUrl = urlData.signedUrl;
    }

    return success(res, { url: fileUrl, path: filePath }, 'File uploaded');
  } catch (err) { return error(res, err.message); }
};

module.exports = { uploadFile };
