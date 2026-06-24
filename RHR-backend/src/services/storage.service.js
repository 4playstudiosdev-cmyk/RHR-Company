const { supabaseAdmin } = require('../config/supabase');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'rhr-uploads';

async function uploadFile({ buffer, mimetype, originalname, folder }) {
  const ext      = originalname.split('.').pop();
  const filename = (folder || 'general') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;

  const { data, error } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: mimetype, upsert: false });

  if (error) throw new Error(error.message);

  const { data: urlData } = supabaseAdmin
    .storage
    .from(BUCKET)
    .getPublicUrl(filename);

  return { path: filename, url: urlData.publicUrl };
}

async function deleteFile(filePath) {
  const { error } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .remove([filePath]);

  if (error) throw new Error(error.message);
  return { deleted: true };
}

async function getSignedUrl(filePath, expiresIn) {
  const { data, error } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .createSignedUrl(filePath, expiresIn || 3600);

  if (error) throw new Error(error.message);
  return { url: data.signedUrl };
}

module.exports = { uploadFile, deleteFile, getSignedUrl };
