// Activity log (sql/phase83) — the order tracker. Best-effort: logging never
// fails or slows the real action, and does nothing until the table exists.
const { pgrestGet, pgrestPost } = require('../utils/directQuery');

let missingTable = false;

/**
 * @param {object} a
 * @param {string} a.action  order_placed | order_refused | cart_changes | order_status | order_date | order_items | credit_limit
 * @param {object} [a.user]  req.user (actor)
 */
async function logActivity({ action, user, companyId, customerId, orderId, summary, details }) {
  if (missingTable) return;
  try {
    await pgrestPost('activity_log', {
      company_id:  companyId || user?.company_id || null,
      customer_id: customerId || null,
      order_id:    orderId || null,
      action,
      actor_id:    user?.id || null,
      actor_role:  user?.role || null,
      actor_name:  user?.full_name || user?.fullName || null,
      summary:     summary ? String(summary).slice(0, 500) : null,
      details:     details || null,
    });
  } catch (e) {
    if (/activity_log/.test(e.message || '') && /(does not exist|schema cache|42P01|PGRST205)/i.test(e.message || '')) {
      missingTable = true; // run sql/phase83_activity_log.sql
      console.warn('activity_log table missing — run sql/phase83_activity_log.sql');
    } else {
      console.warn('activity log failed:', e.message);
    }
  }
}

/** Product names for a list of order items ({product_id, quantity}). */
async function describeItems(items) {
  try {
    const ids = [...new Set((items || []).map((i) => i.product_id).filter(Boolean))];
    if (!ids.length) return [];
    const rows = await pgrestGet('products', { select: 'id,name,price', id: `in.(${ids.join(',')})` });
    const byId = Object.fromEntries((rows || []).map((p) => [p.id, p]));
    return (items || []).map((i) => ({
      product_id: i.product_id,
      name: byId[i.product_id]?.name || 'Product',
      color: i.color || null,
      quantity: Number(i.quantity) || 0,
      unit_price: byId[i.product_id] ? Number(byId[i.product_id].price) : null,
    }));
  } catch (_) { return []; }
}

module.exports = { logActivity, describeItems };
