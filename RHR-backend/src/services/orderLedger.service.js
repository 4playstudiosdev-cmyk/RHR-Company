const { pgrestGet, pgrestPatch, pgrestDelete } = require('../utils/directQuery');

// What an order currently owes the customer's ledger: its debit(s) minus any credit already
// posted against it. Cash collected on delivery / payments are separate entries with no order
// reference, so they are not counted here.
async function orderLedgerNet(orderId) {
  const rows = await pgrestGet('ledger_entries', {
    select: 'entry_type,amount',
    reference_type: 'eq.order',
    reference_id: `eq.${orderId}`,
  });
  return (rows || []).reduce(
    (n, r) => n + (r.entry_type === 'debit' ? Number(r.amount) : -Number(r.amount)), 0);
}

// What each customer owes NOW = all debits − all credits, the same sum the Ledger
// page shows. Never use "the newest entry's running_balance": entries back-dated to
// the same moment (e.g. opening balance and a vendor transfer both at 00:00) leave
// that stored snapshot wrong. Paged, so a branch with >1000 ledger rows is complete.
async function customerBalances(customerIds) {
  const ids = [...new Set((customerIds || []).filter(Boolean))];
  const out = Object.fromEntries(ids.map((id) => [id, 0]));
  const PAGE = 1000;
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150).join(',');
    for (let offset = 0; ; offset += PAGE) {
      const rows = await pgrestGet('ledger_entries', {
        select: 'customer_id,entry_type,amount',
        customer_id: `in.(${chunk})`,
        order: 'id.asc', limit: String(PAGE), offset: String(offset),
      });
      for (const r of rows || []) {
        out[r.customer_id] += r.entry_type === 'debit' ? Number(r.amount) : -Number(r.amount);
      }
      if (!rows || rows.length < PAGE) break;
    }
  }
  return out;
}

async function customerBalance(customerId) {
  return (await customerBalances([customerId]))[customerId] || 0;
}

// Recalculate and patch running_balance for all of a customer's ledger entries.
// Needed after hard-deleting an entry so stored running_balance values stay accurate
// for future writes (getLedger recalculates on the fly, but creditLedger/adjustLedger
// read the last stored running_balance to compute the next one).
async function recalcCustomerLedger(customerId) {
  const entries = await pgrestGet('ledger_entries', {
    select: 'id,entry_type,amount,running_balance,reference_type',
    customer_id: `eq.${customerId}`,
    order: 'created_at.asc,id.asc', // fixed order for entries at the same moment
  });
  if (!entries?.length) return;
  // Opening balance always leads
  entries.sort((a, b) => {
    const aOp = a.reference_type === 'opening_balance' ? 0 : 1;
    const bOp = b.reference_type === 'opening_balance' ? 0 : 1;
    if (aOp !== bOp) return aOp - bOp;
    return 0;
  });
  let bal = 0;
  for (const e of entries) {
    bal = e.entry_type === 'debit' ? bal + Number(e.amount) : bal - Number(e.amount);
    if (Number(e.running_balance) !== bal) {
      await pgrestPatch('ledger_entries', { id: `eq.${e.id}` }, { running_balance: bal });
    }
  }
}

// Hard-delete all ledger entries for an order and recalculate the customer's running
// balances. No reversal entry is left behind — the order disappears from the ledger
// completely. Returns the net amount that was removed (0 if nothing was there).
async function deleteOrderLedgerEntries(order) {
  const net = await orderLedgerNet(order.id);
  if (net === 0) return 0;
  await pgrestDelete('ledger_entries', {
    reference_type: 'eq.order',
    reference_id: `eq.${order.id}`,
  });
  await recalcCustomerLedger(order.customer_id);
  return net;
}

// Recalculate and patch running_balance for all of a supplier's ledger entries.
async function recalcSupplierLedger(supplierId) {
  const entries = await pgrestGet('supplier_ledger_entries', {
    select: 'id,entry_type,amount,running_balance,reference_type',
    supplier_id: `eq.${supplierId}`,
    order: 'created_at.asc',
  });
  if (!entries?.length) return;
  entries.sort((a, b) => {
    const aOp = a.reference_type === 'opening_balance' ? 0 : 1;
    const bOp = b.reference_type === 'opening_balance' ? 0 : 1;
    if (aOp !== bOp) return aOp - bOp;
    return 0;
  });
  let bal = 0;
  for (const e of entries) {
    bal = e.entry_type === 'debit' ? bal + Number(e.amount) : bal - Number(e.amount);
    if (Number(e.running_balance) !== bal) {
      await pgrestPatch('supplier_ledger_entries', { id: `eq.${e.id}` }, { running_balance: bal });
    }
  }
}

// ─── Order total = items + conveyance + sales tax ───────────────────────────
// One rule everywhere (invoice, preview, ledger): sales tax is 18% of the items
// subtotal when the invoice was made "with tax"; conveyance is the saved
// invoice_conveyance. orders.total_amount holds the full amount so the order
// list, ledger and reports all show what the customer actually owes.
const TAX_RATE = 0.18;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

async function computeOrderCharges(orderId) {
  const [orders, items] = await Promise.all([
    pgrestGet('orders', { select: 'id,order_number,customer_id,company_id,status,total_amount,invoice_with_tax,invoice_conveyance', id: `eq.${orderId}` }),
    pgrestGet('order_items', { select: 'subtotal', order_id: `eq.${orderId}` }),
  ]);
  const order = orders?.[0];
  if (!order) return null;
  const subtotal = round2((items || []).reduce((s, it) => s + Number(it.subtotal || 0), 0));
  const conveyance = round2(order.invoice_conveyance);
  const tax = order.invoice_with_tax ? round2(subtotal * TAX_RATE) : 0;
  return { order, subtotal, conveyance, tax, total: round2(subtotal + conveyance + tax) };
}

// Writes the full total to the order and keeps the order's ONE ledger line in
// step: amount = total, text "Order <no> delivered". A separately posted
// "Sales Tax (18%) — Order #<no>" line (older invoices) is folded into it and
// removed, so tax is never counted twice or lost. If the order has no ledger
// line yet (not delivered), delivery will post the full total_amount.
async function syncOrderTotal(orderId) {
  const c = await computeOrderCharges(orderId);
  if (!c) return null;
  const { order, total } = c;
  if (round2(order.total_amount) !== total) {
    await pgrestPatch('orders', { id: `eq.${orderId}` }, { total_amount: total });
  }

  const taxText = `Sales Tax (18%) — Order #${order.order_number}`;
  const convText = `Conveyance Charge — Order #${order.order_number}`;
  const [linked, taxAdj, convAdj] = await Promise.all([
    pgrestGet('ledger_entries', {
      select: 'id,amount,description,created_at',
      reference_type: 'eq.order', reference_id: `eq.${orderId}`, entry_type: 'eq.debit',
      order: 'created_at.asc',
    }),
    pgrestGet('ledger_entries', {
      select: 'id', customer_id: `eq.${order.customer_id}`, entry_type: 'eq.debit',
      description: `eq.${taxText}`, reference_type: 'neq.order',
    }).catch(() => []),
    pgrestGet('ledger_entries', {
      select: 'id,amount', customer_id: `eq.${order.customer_id}`, entry_type: 'eq.debit',
      description: `eq.${convText}`,
    }).catch(() => []),
  ]);
  const rows = linked || [];
  if (rows.length) {
    const main = rows.find((r) => /^Order\s/i.test(r.description || '')) || rows[0];
    const extras = rows.filter((r) => r.id !== main.id && (r.description || '').startsWith('Sales Tax'));
    // An old separate "Conveyance Charge" line is the same conveyance now inside
    // the total — remove it only when it matches the saved conveyance exactly.
    const convSum = (convAdj || []).reduce((s, x) => s + Number(x.amount || 0), 0);
    const convFolded = c.conveyance > 0 && round2(convSum) === c.conveyance ? (convAdj || []) : [];
    await pgrestPatch('ledger_entries', { id: `eq.${main.id}` }, {
      amount: total,
      description: `Order ${order.order_number} ${order.status === 'delivered' ? 'delivered' : 'confirmed'}`,
    });
    for (const x of [...extras, ...(taxAdj || []), ...convFolded]) await pgrestDelete('ledger_entries', { id: `eq.${x.id}` });
    await recalcCustomerLedger(order.customer_id);
  }
  return { ...c, total };
}

module.exports = { orderLedgerNet, deleteOrderLedgerEntries, recalcCustomerLedger, recalcSupplierLedger, customerBalances, customerBalance, computeOrderCharges, syncOrderTotal, TAX_RATE };
