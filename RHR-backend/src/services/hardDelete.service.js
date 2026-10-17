const { pgrestGet, pgrestPatch, pgrestDelete } = require('../utils/directQuery');
const { supabaseAdmin } = require('../config/supabase');

// Permanent ("real") delete for a customer or a salesman: removes the row
// itself plus everything that hangs off it, in an order the foreign keys
// allow, then the Supabase Auth login. The old DELETE endpoints only set
// is_active=false, so the row (and its ledger, orders, payments ...) stayed
// in the database — and deleting it by hand in the Supabase table editor
// failed with "still referenced from table ledger_entries".
//
// Everything goes through the pgrest raw-https helpers (see
// utils/directQuery.js), same as the rest of the backend.

// A table or column that doesn't exist on this environment (older
// migrations not run yet) just means there's nothing to clean there.
const isMissing = (e) => /PGRST20[45]|42P01|42703|does not exist|Could not find/i.test(e.message || '');

async function wipe(table, params) {
  try {
    const rows = await pgrestDelete(table, params);
    return Array.isArray(rows) ? rows.length : 0;
  } catch (e) {
    if (isMissing(e)) return 0;
    throw new Error(`${table}: ${e.message}`);
  }
}

async function detach(table, params, patch) {
  try {
    await pgrestPatch(table, params, patch);
  } catch (e) {
    if (isMissing(e)) return;
    throw new Error(`${table}: ${e.message}`);
  }
}

async function removeAuthUser(id) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
  // Already gone (e.g. a customer an admin added who never logged in) is fine.
  if (error && !/not found|does not exist/i.test(error.message || '')) throw new Error(`auth user: ${error.message}`);
}

const chunk = (arr, n = 50) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

async function deleteCustomerPermanently(customerId) {
  const eq = `eq.${customerId}`;
  const counts = {};

  // Their orders first — order_items / order_returns / payments hang off them.
  const orders = await pgrestGet('orders', { select: 'id', customer_id: eq });
  const orderIds = (orders || []).map((o) => o.id);
  for (const ids of chunk(orderIds)) {
    const list = `in.(${ids.join(',')})`;
    counts.order_returns = (counts.order_returns || 0) + await wipe('order_returns', { order_id: list }); // before order_items (FK)
    counts.payments      = (counts.payments || 0)      + await wipe('payments', { order_id: list });
    counts.order_items   = (counts.order_items || 0)   + await wipe('order_items', { order_id: list });
  }
  counts.order_returns = (counts.order_returns || 0) + await wipe('order_returns', { customer_id: eq });
  counts.orders        = await wipe('orders', { customer_id: eq });

  counts.payments             = (counts.payments || 0) + await wipe('payments', { customer_id: eq });
  counts.ledger_entries       = await wipe('ledger_entries', { customer_id: eq });
  counts.customer_prices      = await wipe('customer_product_prices', { customer_id: eq });
  counts.customer_visits      = await wipe('customer_visits', { customer_id: eq });
  counts.salesman_recoveries  = await wipe('salesman_recoveries', { customer_id: eq });
  await wipe('recoveries', { customer_id: eq });
  // No foreign key on these, so they'd be left orphaned otherwise.
  await wipe('opening_balances', { entity_id: eq });
  await wipe('notifications', { recipient_id: eq });

  await wipe('users', { id: eq });
  await removeAuthUser(customerId);
  return counts;
}

async function deleteSalesmanPermanently(salesmanId) {
  const eq = `eq.${salesmanId}`;
  const counts = {};

  // Customers assigned to them and records that merely mention them stay,
  // just unlinked — those belong to the customers / the business.
  await detach('users', { salesman_id: eq }, { salesman_id: null });
  await detach('orders', { salesman_id: eq }, { salesman_id: null });
  await detach('expenses', { salesman_id: eq }, { salesman_id: null });
  await detach('driver_cash_handoffs', { salesman_id: eq }, { salesman_id: null });

  // Their own activity (salesman_id is NOT NULL on payments/visits, so
  // these can't be kept without them).
  counts.payments            = await wipe('payments', { salesman_id: eq });
  counts.customer_visits     = await wipe('customer_visits', { salesman_id: eq });
  counts.salesman_recoveries = await wipe('salesman_recoveries', { salesman_id: eq });
  counts.cash_closings       = await wipe('salesman_cash_closings', { salesman_id: eq });
  await wipe('recoveries', { salesman_id: eq });
  await wipe('gps_locations', { user_id: eq });
  await wipe('attendance', { user_id: eq });
  await wipe('leave_requests', { user_id: eq });
  await wipe('salary_structures', { user_id: eq });
  await wipe('notifications', { recipient_id: eq });

  await wipe('salesmen', { id: eq });
  await removeAuthUser(salesmanId);
  return counts;
}

module.exports = { deleteCustomerPermanently, deleteSalesmanPermanently };
