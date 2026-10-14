const { success, error } = require('../utils/response');
const { pgrestGet } = require('../utils/directQuery');
const { sendWhatsAppText, sendWhatsAppDocument } = require('../utils/whatsappBot');

// GET /api/v1/broadcast/customers — super_admin only, every approved
// customer across every branch with a phone number, for the selection
// list on the WhatsApp Notification panel.
const getBroadcastCustomers = async (req, res) => {
  try {
    const data = await pgrestGet('users', {
      select: 'id,full_name,phone,whatsapp_phone,city,company_id',
      role: 'eq.customer',
      is_approved: 'eq.true',
      is_active: 'eq.true',
      order: 'full_name.asc',
    });
    return success(res, data || []);
  } catch (err) { return error(res, err.message); }
};

// Sent one at a time (not Promise.all) — the whatsapp-bot service is a
// single WhatsApp Web session underneath; firing every send at once
// risks tripping WhatsApp's own spam/rate limiting on that one number,
// the same reason a real person sending bulk messages pauses between
// them. Runs in the background (see sendBroadcast below) — at a few
// hundred customers this easily outlives an HTTP request's timeout.
async function runBroadcast(customers, { message, image_base64, image_mime_type, image_file_name }) {
  let sent = 0;
  const failures = [];
  for (const customer of customers) {
    const phone = customer.whatsapp_phone || customer.phone;
    if (!phone) { failures.push({ id: customer.id, name: customer.full_name, reason: 'No phone number on file' }); continue; }
    try {
      if (image_base64) {
        await sendWhatsAppDocument(phone, {
          base64: image_base64,
          mimeType: image_mime_type || 'image/jpeg',
          fileName: image_file_name || 'image.jpg',
          caption: message || '',
        });
      } else {
        await sendWhatsAppText(phone, message);
      }
      sent++;
    } catch (err) {
      failures.push({ id: customer.id, name: customer.full_name, reason: err.message });
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(`[broadcast] done — sent ${sent}/${customers.length}, ${failures.length} failed`,
    failures.length ? failures : '');
}

// POST /api/v1/broadcast/send — { customer_ids: string[], message,
// image_base64?, image_mime_type?, image_file_name? }. Responds as soon
// as the send list is resolved and kicks the actual sending off in the
// background — a "Broadcast started" response, not "broadcast complete".
const sendBroadcast = async (req, res) => {
  try {
    const { customer_ids, message, image_base64, image_mime_type, image_file_name } = req.body;
    if (!Array.isArray(customer_ids) || customer_ids.length === 0)
      return error(res, 'customer_ids (non-empty array) is required', 400);
    if (!message && !image_base64)
      return error(res, 'message or an image is required', 400);

    const idList = customer_ids.join(',');
    const customers = await pgrestGet('users', {
      select: 'id,full_name,phone,whatsapp_phone',
      id: `in.(${idList})`,
      role: 'eq.customer',
    });

    runBroadcast(customers || [], { message, image_base64, image_mime_type, image_file_name })
      .catch((err) => console.error('[broadcast] failed:', err.message));

    return success(res, { total: customers?.length || 0 },
      `Broadcast started — sending to ${customers?.length || 0} customers in the background.`);
  } catch (err) { return error(res, err.message); }
};

module.exports = { getBroadcastCustomers, sendBroadcast };
