const { pgrestGet } = require('../utils/directQuery');
const { sendWhatsAppText } = require('../utils/whatsappBot');
const { uploadBase64ToStorage } = require('../utils/storageUpload');
const { buildMoneyReceiptPDF } = require('./moneyReceipt.service');
const { notifyUser } = require('./notify.service');

// Fired after a payment is created (customer self-submits a payment proof
// from the app, or a salesman records a Recovery in the field) — builds
// the Money Receipt PDF and sends it to the customer's WhatsApp, plus an
// in-app/push notification, so they have proof of submission immediately
// even though the amount only actually lands on their ledger once an
// admin approves it (see reviewPayment in payments.service.js).
//
// Fire-and-forget by design: the caller does NOT await this on the
// request/response path — a slow or failing WhatsApp send must never
// delay or break the payment-recording API call itself.
async function sendPaymentReceipt(payment) {
  try {
    const [customerRows, salesmanRows, companyRows] = await Promise.all([
      pgrestGet('users', { select: 'full_name,phone,whatsapp_phone', id: `eq.${payment.customer_id}` }),
      payment.salesman_id
        ? pgrestGet('salesmen', { select: 'full_name', id: `eq.${payment.salesman_id}` })
        : Promise.resolve([]),
      pgrestGet('companies', { select: 'name,city,phone,address', id: `eq.${payment.company_id}` }),
    ]);

    const customer = customerRows?.[0];
    const salesman = salesmanRows?.[0];
    const company = companyRows?.[0];
    if (!customer) return;

    const status = payment.status === 'approved' ? 'approved' : 'pending';
    const receiptNo = `RCT-${payment.id.slice(0, 8).toUpperCase()}`;

    const pdfBuffer = await buildMoneyReceiptPDF({ receiptNo, payment, customer, salesman, company, status });

    // Sending the PDF itself as a WhatsApp attachment currently crashes
    // inside WhatsApp Web's own JS (a live whatsapp-web.js/WhatsApp-Web
    // compatibility bug, reproduced independent of caption/send-method —
    // plain text is unaffected). Uploading it and linking to it from a
    // text message sidesteps that entirely; swap back to an attachment
    // once that upstream issue is fixed.
    let receiptUrl = null;
    try {
      const uploaded = await uploadBase64ToStorage({
        bucket: 'money-receipts',
        fileName: `${receiptNo}.pdf`,
        fileBase64: pdfBuffer.toString('base64'),
        mimeType: 'application/pdf',
        companyId: payment.company_id,
      });
      receiptUrl = uploaded.url;
    } catch (err) {
      console.error('[sendPaymentReceipt] receipt upload failed:', err.message);
    }

    const targetPhone = customer.whatsapp_phone || customer.phone;
    if (targetPhone) {
      const statusLine = status === 'approved'
        ? '✅ *Payment Approved*'
        : '🧾 *Payment Received — Pending Admin Approval*';
      const message =
        `${statusLine}\n\n` +
        `*RHR & Company — Money Receipt*\n` +
        `No: ${receiptNo}\n` +
        `Amount: PKR ${Number(payment.amount).toLocaleString()}\n` +
        `Method: ${(payment.method || 'cash').toUpperCase()}\n` +
        `Received by: ${salesman?.full_name || 'RHR & Company'}\n\n` +
        (status === 'approved'
          ? 'This payment has been approved and credited to your account.'
          : 'This payment is pending admin approval. It will be credited to your account once approved.') +
        (receiptUrl ? `\n\nView/download your receipt:\n${receiptUrl}` : '');

      try {
        await sendWhatsAppText(targetPhone, message);
      } catch (err) {
        console.error('[sendPaymentReceipt] WhatsApp send failed:', err.message);
      }
    }

    await notifyUser({
      companyId: payment.company_id,
      recipientId: payment.customer_id,
      title: status === 'approved' ? 'Payment Approved' : 'Payment Received',
      body: status === 'approved'
        ? `Your payment of PKR ${Number(payment.amount).toLocaleString()} has been approved.`
        : `Your payment of PKR ${Number(payment.amount).toLocaleString()} has been received and is pending admin approval.`,
      type: 'payment',
    });
  } catch (err) {
    console.error('[sendPaymentReceipt] failed:', err.message);
  }
}

module.exports = { sendPaymentReceipt };
