const { sendWhatsAppText } = require('../utils/whatsappBot');
const { pgrestGet } = require('../utils/directQuery');
const { notifyUser } = require('./notify.service');

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

// A super admin set this customer's outstanding balance to a new figure (see
// PATCH /ledger/:customerId/balance). Tells the customer AND their salesman — in the
// app (notification + phone push) and on WhatsApp — so nobody is surprised by the
// new number. Fire-and-forget like the rest of this file.
function balanceChanged({ customer, previous, current }) {
  return (async () => {
    try {
      const name = customer.shop_name || customer.full_name || 'Customer';
      const now = balanceLines(current);
      const was = money(previous);
      const is = money(Math.abs(current)) + (current < 0 ? ' (advance / credit)' : '');

      // ── customer ──
      const toCustomer = customer.whatsapp_phone || customer.phone;
      if (toCustomer) {
        const text = [
          '*RHR & Company*',
          '',
          greeting(customer),
          'Your account balance has been updated by our office ✏️',
          'Previous: ' + was,
          'Now: *' + is + '*',
          now.en,
          '',
          'Aap ke account ka balance office ne update kiya hai. Pehle ' + was + ' tha, ab ' + is + ' hai.',
        ].join('\n');
        Promise.race([
          sendWhatsAppText(toCustomer, text),
          new Promise((_, rej) => setTimeout(() => rej(new Error('WhatsApp send timed out')), SEND_TIMEOUT_MS)),
        ]).catch((e) => console.error('[balance-msg] WhatsApp to customer failed:', e.message));
      }
      await notifyUser({
        companyId: customer.company_id,
        recipientId: customer.id,
        title: 'Account balance updated',
        body: 'Your outstanding balance was updated from ' + was + ' to ' + is + '.',
        type: 'payment',
      });

      // ── the customer's salesman ──
      if (customer.salesman_id) {
        const rows = await pgrestGet('salesmen', { select: 'id,full_name,phone', id: 'eq.' + customer.salesman_id });
        const sm = rows?.[0];
        if (sm?.phone) {
          const text = [
            '*RHR & Company*',
            '',
            'Hello ' + (sm.full_name || '') + ',',
            'The outstanding balance of your customer *' + name + '* was changed by the office ✏️',
            'Previous: ' + was,
            'Now: *' + is + '*',
            '',
            'Aap ke customer ' + name + ' ka outstanding balance office ne badla hai: ' + was + ' se ' + is + '.',
          ].join('\n');
          Promise.race([
            sendWhatsAppText(sm.phone, text),
            new Promise((_, rej) => setTimeout(() => rej(new Error('WhatsApp send timed out')), SEND_TIMEOUT_MS)),
          ]).catch((e) => console.error('[balance-msg] WhatsApp to salesman failed:', e.message));
        }
        await notifyUser({
          companyId: customer.company_id,
          recipientId: customer.salesman_id,
          title: 'Customer balance updated',
          body: name + "'s outstanding balance was changed from " + was + ' to ' + is + ' by the office.',
          type: 'payment',
        });
      }
    } catch (err) {
      console.error('[balance-msg] failed:', err.message);
    }
  })();
}

module.exports = { paymentReceived, paymentPending, balanceChanged };
