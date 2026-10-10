const axios = require('axios');

// Shared by otp.service.js-style plain-text sends and the money-receipt
// PDF attachment send — both talk to the same standalone RHR-whatsapp-bot
// service. validateStatus lets every response through so a real error
// message (e.g. "not registered on WhatsApp") comes back instead of
// axios throwing a generic "Request failed with status code 404".
async function sendWhatsAppText(phoneNumber, message) {
  const serviceUrl = process.env.WHATSAPP_SERVICE_URL;
  if (!serviceUrl) throw new Error('WHATSAPP_SERVICE_URL is not configured');

  const { data } = await axios.post(
    `${serviceUrl}/send-whatsapp`,
    { phone: phoneNumber, message },
    { validateStatus: () => true }
  );
  if (!data?.success) throw new Error(data?.message || 'WhatsApp send failed');
}

// caption: shown alongside the attachment in WhatsApp (the bot's
// `message` field doubles as the caption when media is present).
async function sendWhatsAppDocument(phoneNumber, { base64, mimeType, fileName, caption }) {
  const serviceUrl = process.env.WHATSAPP_SERVICE_URL;
  if (!serviceUrl) throw new Error('WHATSAPP_SERVICE_URL is not configured');

  const { data } = await axios.post(
    `${serviceUrl}/send-whatsapp`,
    {
      phone: phoneNumber,
      message: caption || '',
      mediaBase64: base64,
      mediaMimeType: mimeType,
      mediaFileName: fileName,
    },
    { validateStatus: () => true }
  );
  if (!data?.success) throw new Error(data?.message || 'WhatsApp document send failed');
}

module.exports = { sendWhatsAppText, sendWhatsAppDocument };
