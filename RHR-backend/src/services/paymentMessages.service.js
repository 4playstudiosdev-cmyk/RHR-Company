const { sendWhatsAppText } = require('../utils/whatsappBot');
const { pgrestGet } = require('../utils/directQuery');

// WhatsApp messages to a CUSTOMER about a payment taken from them:
//   * received — cash recorded by a salesman, or a bank transfer / online
//                payment once an admin approves it: "we received PKR X, your
//                outstanding balance is PKR Y";
//   * pending  — a bank transfer a salesman recorded, waiting for admin
//                approval: "your PKR X is pending, we'll confirm it".
// Sent to the customer's WhatsApp number (else the number they log in with).
// The outstanding balance is the customer's latest ledger running balance
// (debit-positive), so call `received` AFTER the ledger credit is posted.
//
// Fire-and-forget by design: a slow or down WhatsApp bot must never slow down
// or fail recording/approving a payment, so callers don't await these and
// every failure is only logged.

const SEND_TIMEOUT_MS = 20000;
const money = (n) => `PKR ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const METHOD_LABEL = { cash: 'cash', bank_transfer: 'bank transfer', bank: 'bank transfer' };

async function loadCustomer(customerId) {
  const rows = await pgrestGet('users', { select: 'id,full_name,phone,whatsapp_phone', id: `eq.${customerId}` });
  return rows?.[0] || null;
}

async function currentBalance(customerId) {
  const rows = await pgrestGet('ledger_entries', {
    select: 'running_balance',
    customer_id: `eq.${customerId}`,
    order: 'created_at.desc',
    limit: '1',
  });
  return Number(rows?.[0]?.running_balance) || 0;
}

const greeting = (c) => (String(c?.full_name || '').trim() ? `Hello ${String(c.full_name).trim()},` : 'Hello,');

function balanceLines(balance) {
  if (balance > 0) {
    return {
      en: `Your outstanding balance is *${money(balance)}*.`,
      ur: `Aap ka outstanding balance ${money(balance)} hai.`,
    };
  }
  if (balance < 0) {
    return {
      en: `You have no outstanding balance — your account is in credit by *${money(-balance)}*.`,
      ur: `Aap ka koi outstanding balance nahi, aap ka ${money(-balance)} advance hai.`,
    };
  }
  return { en: 'Your outstanding balance is *PKR 0*.', ur: 'Aap ka outstanding balance PKR 0 hai.' };
}

async function send(customerId, build) {
  try {
    const customer = await loadCustomer(customerId);
    const to = customer?.whatsapp_phone || customer?.phone;
    if (!to) return;
    const text = await build(customer);
    await Promise.race([
      sendWhatsAppText(to, text),
      new Promise((_, reject) => setTimeout(() => reject(new Error('WhatsApp send timed out')), SEND_TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.error(`[payment-msg] to customer ${customerId} failed:`, err.message);
  }
}

// amount received (cash, or approved bank transfer / online)
function paymentReceived({ customerId, amount, method }) {
  return send(customerId, async (customer) => {
    const bal = balanceLines(await currentBalance(customerId));
    const how = METHOD_LABEL[method] || method || 'payment';
    return (
      '*RHR & Company*\n\n' +
      `${greeting(customer)}\n` +
      `We have received your payment of *${money(amount)}* (${how}) ✅\n` +
      `${bal.en}\n\n` +
      `Aap ki ${money(amount)} ki payment mil gayi hai. ${bal.ur}`
    );
  });
}

// bank transfer waiting for admin approval
function paymentPending({ customerId, amount }) {
  return send(customerId, async (customer) => {
    const bal = balanceLines(await currentBalance(customerId));
    return (
      '*RHR & Company*\n\n' +
      `${greeting(customer)}\n` +
      `Your bank transfer of *${money(amount)}* is *pending* confirmation ⏳\n` +
      'We will message you here as soon as it is approved.\n' +
      `${bal.en} (this will update once the payment is approved)\n\n` +
      `Aap ki ${money(amount)} ki bank transfer abhi pending hai. Approve hote hi aap ko isi number par message mil jayega.`
    );
  });
}

module.exports = { paymentReceived, paymentPending };
