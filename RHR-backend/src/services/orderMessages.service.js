const { sendWhatsAppText } = require('../utils/whatsappBot');
const { pgrestGet } = require('../utils/directQuery');
const { notifyUser } = require('./notify.service');

// Tells the CUSTOMER about their order — by WhatsApp (on their WhatsApp
// number, else their login number) and as an in-app notification (+ push
// when they have a token) — whoever placed or moved the order: the customer
// themselves, a salesman, a driver with sales access, or an admin.
//   * orderPlaced   — right after an order is created;
//   * statusChanged — confirmed / preparing / dispatched / delivered /
//                     undelivered / cancelled.
//
// Fire-and-forget by design: a slow or down WhatsApp bot (or any hiccup
// here) must never slow down or fail the order itself, so callers don't
// await these and every failure is only logged.

const SEND_TIMEOUT_MS = 20000;
const money = (n) => `PKR ${Number(n || 0).toLocaleString('en-US')}`;

const withTimeout = (promise) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('WhatsApp send timed out')), SEND_TIMEOUT_MS)),
]);

async function loadCustomer(customerId) {
  const rows = await pgrestGet('users', { select: 'id,full_name,phone,whatsapp_phone', id: `eq.${customerId}` });
  return rows?.[0] || null;
}

function greeting(customer) {
  const name = String(customer?.full_name || '').trim();
  return name ? `Hello ${name},` : 'Hello,';
}

function itemLines(items) {
  const lines = (items || []).slice(0, 12).map((i) => `• ${i.product_name} × ${i.quantity}`);
  if ((items || []).length > 12) lines.push(`• …and ${items.length - 12} more`);
  return lines.join('\n');
}

async function deliver({ companyId, customer, customerId, order, title, inApp, whatsapp }) {
  const to = customer?.whatsapp_phone || customer?.phone;
  if (to) {
    withTimeout(sendWhatsAppText(to, whatsapp))
      .catch((err) => console.error(`[order-msg] WhatsApp to customer ${customerId} failed:`, err.message));
  }
  await notifyUser({
    companyId,
    recipientId: customerId,
    title,
    body: inApp,
    type: 'order',
    referenceId: order.id,
  });
}

async function orderPlaced({ order, customerId, customer: known, items, totalAmount, companyId }) {
  try {
    const customer = (known?.phone || known?.whatsapp_phone) ? known : await loadCustomer(customerId);
    const whatsapp =
      '*RHR & Company*\n\n' +
      `${greeting(customer)}\n` +
      `Your order *${order.order_number}* has been placed ✅\n\n` +
      `${itemLines(items)}\n\n` +
      `Total: *${money(totalAmount)}*\n` +
      'We will confirm it shortly and keep you updated here.\n\n' +
      `Aap ka order ${order.order_number} place ho gaya hai. Hum jald confirm kar ke aap ko isi number par update karte rahenge.`;
    await deliver({
      companyId, customer, customerId, order,
      title: 'Order placed',
      inApp: `Your order ${order.order_number} (${money(totalAmount)}) has been placed.`,
      whatsapp,
    });
  } catch (err) {
    console.error('[order-msg] orderPlaced failed:', err.message);
  }
}

const STATUS_COPY = {
  confirmed: {
    title: 'Order confirmed',
    inApp: (o) => `Your order ${o.order_number} has been confirmed.`,
    wa: (o) => `Your order *${o.order_number}* is *confirmed* ✅\n\nAap ka order confirm ho gaya hai.`,
  },
  preparing: {
    title: 'Order being prepared',
    inApp: (o) => `Your order ${o.order_number} is being prepared.`,
    wa: (o) => `Your order *${o.order_number}* is now being *prepared* 📦\n\nAap ka order tayyar kiya ja raha hai.`,
  },
  dispatched: {
    title: 'Order out for delivery',
    inApp: (o, x) => `Your order ${o.order_number} is out for delivery${x.driverLine ? ` — ${x.driverLine}` : ''}.`,
    wa: (o, x) => `Your order *${o.order_number}* is *out for delivery* 🚚` +
      `${x.driverLine ? `\nDriver: ${x.driverLine}` : ''}\n\nAap ka order delivery ke liye rawana ho gaya hai.`,
  },
  delivered: {
    title: 'Order delivered',
    inApp: (o) => `Your order ${o.order_number} has been delivered. Thank you!`,
    wa: (o) => `Your order *${o.order_number}* has been *delivered* ✅\nThank you for your business!\n\nAap ka order deliver ho gaya hai. Shukriya!`,
  },
  undelivered: {
    title: 'Delivery not completed',
    inApp: (o) => `We could not deliver your order ${o.order_number}. We will contact you.`,
    wa: (o) => `We could not complete the delivery of order *${o.order_number}* ⚠️\nOur team will contact you shortly.\n\nAap ka order deliver nahi ho saka, hum jald rabta karenge.`,
  },
  cancelled: {
    title: 'Order cancelled',
    inApp: (o, x) => `Your order ${o.order_number} has been cancelled${x.reason ? ` — ${x.reason}` : ''}.`,
    wa: (o, x) => `Your order *${o.order_number}* has been *cancelled* ❌` +
      `${x.reason ? `\nReason: ${x.reason}` : ''}\n\nAap ka order cancel kar diya gaya hai.`,
  },
};

async function statusChanged({ order, status, cancellationReason }) {
  try {
    const copy = STATUS_COPY[status];
    if (!copy || !order?.customer_id) return;
    const customer = await loadCustomer(order.customer_id);

    const extra = { reason: cancellationReason || order.cancellation_reason || '', driverLine: '' };
    if (status === 'dispatched') {
      if (order.driver_id) {
        const drivers = await pgrestGet('drivers', { select: 'full_name,phone,car_number', id: `eq.${order.driver_id}` });
        const d = drivers?.[0];
        if (d) extra.driverLine = [d.full_name, d.car_number, d.phone].filter(Boolean).join(' · ');
      } else if (order.car_number) {
        extra.driverLine = order.car_number;
      }
    }

    const whatsapp = `*RHR & Company*\n\n${greeting(customer)}\n${copy.wa(order, extra)}`;
    await deliver({
      companyId: order.company_id, customer, customerId: order.customer_id, order,
      title: copy.title,
      inApp: copy.inApp(order, extra),
      whatsapp,
    });
  } catch (err) {
    console.error(`[order-msg] statusChanged(${status}) failed:`, err.message);
  }
}

module.exports = { orderPlaced, statusChanged };
