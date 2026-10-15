const svc = require('../services/orders.service');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');

const createOrder = async (req, res) => {
  try {
    const { items, notes, delivery_address, customer_id } = req.body;
    const user = req.user;

    if (!items || items.length === 0)
      return error(res, 'Order must have at least one item', 400);

    // Customer orders for themselves; salesman orders on behalf of a customer
    const customerId = user.role === 'customer' ? user.id : customer_id;
    if (!customerId) return error(res, 'customer_id is required', 400);

    const data = await svc.createOrder({
      customerId,
      salesmanId:      user.role === 'salesman' ? user.id : null,
      companyId:       user.company_id,
      items,
      notes,
      deliveryAddress: delivery_address,
      createdByRole:   user.role,
      createdById:     user.id
    });
    return success(res, data, 'Order placed successfully', 201);
  } catch (err) { return error(res, err.message, 400); }
};

const getOrders = async (req, res) => {
  try {
    const data = await svc.getOrders(req.user, resolveCompanyId(req));
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const getOrderById = async (req, res) => {
  try {
    const data = await svc.getOrderById(req.params.id, req.user);
    return success(res, data);
  } catch (err) { return error(res, err.message, 404); }
};

const updateOrderStatus = async (req, res) => {
  console.log('=== UPDATE ORDER STATUS DEBUG ===');
  console.log('Order ID from URL:', req.params.id);
  console.log('Status from body:', req.body.status);
  console.log('User company_id:', req.user.company_id);
  console.log('User role:', req.user.role);
  console.log('User id:', req.user.id);
  console.log('================================');

  try {
    const { status, driver_id, car_number, delivery_address, delivered_bags, returned_bags, delivery_notes, priority, cancellation_reason } = req.body;
    if (!status) return error(res, 'status is required', 400);
    if (status === 'cancelled' && !cancellation_reason)
      return error(res, 'A cancellation reason is required', 400);
    const data = await svc.updateOrderStatus(req.params.id, req.user.company_id, status, {
      driverId: driver_id,
      carNumber: car_number,
      deliveryAddress: delivery_address,
      deliveredBags: delivered_bags,
      returnedBags: returned_bags,
      deliveryNotes: delivery_notes,
      priority,
      cancellationReason: cancellation_reason,
    });
    return success(res, data, `Order status updated to ${status}`);
  } catch (err) {
    console.log('ERROR:', err.message);
    return error(res, err.message, 400);
  }
};

// PATCH /api/v1/orders/:id/driver-status — driver's own "Mark as
// Delivered" / "Cancel" buttons on the order-detail screen. Separate
// from the admin-only updateOrderStatus above (not just a relaxed role
// check on it) so a driver is hard-restricted to their own assigned
// order and to exactly the two terminal statuses they're allowed to set
// — everything else about an order (dispatching it, editing items,
// invoicing) stays admin-only.
const driverUpdateOrderStatus = async (req, res) => {
  try {
    const { status, delivered_bags, returned_bags, delivery_notes, amount_collected } = req.body;
    if (!['delivered', 'undelivered'].includes(status))
      return error(res, 'status must be "delivered" or "undelivered"', 400);

    const orders = await pgrestGet('orders', { select: 'id,driver_id,company_id', id: `eq.${req.params.id}` });
    const order = orders?.[0];
    if (!order) return error(res, 'Order not found', 404);
    if (order.driver_id !== req.user.id)
      return error(res, 'Access denied — this order is not assigned to you', 403);

    const data = await svc.updateOrderStatus(req.params.id, order.company_id, status, {
      deliveredBags: delivered_bags,
      returnedBags: returned_bags,
      deliveryNotes: delivery_notes,
      amountCollected: amount_collected,
      collectingDriverId: req.user.id,
    });

    // Best-effort — admin previously had no way to find out a delivery
    // finished (or failed) except by refreshing the Orders page and
    // noticing a status change themselves. 'undelivered' especially
    // needs their attention since it means a customer didn't get their
    // order and someone has to follow up.
    try {
      await pgrestPost('notifications', {
        company_id:     order.company_id,
        recipient_role: 'branch_admin',
        title:          status === 'delivered' ? 'Order Delivered' : 'Order NOT Delivered',
        body:           status === 'delivered'
          ? `${req.user.full_name} delivered order ${data.order_number} — ${delivered_bags ?? 0} bags, ${returned_bags ?? 0} returned.${Number(amount_collected) > 0 ? ` Collected PKR ${Number(amount_collected).toLocaleString()} from customer.` : ''}`
          : `${req.user.full_name} could not deliver order ${data.order_number}.${delivery_notes ? ` Note: ${delivery_notes}` : ''}`,
        type: 'order',
      });
    } catch (e) { /* non-fatal */ }

    return success(res, data, `Order marked ${status}`);
  } catch (err) { return error(res, err.message, 400); }
};

const updateOrderItems = async (req, res) => {
  try {
    const { items, removed_ids, added_items } = req.body;
    const data = await svc.updateOrderItems(
      req.params.id,
      req.user.role === 'super_admin' ? null : req.user.company_id,
      { items: items || [], removedIds: removed_ids || [], addedItems: added_items || [] }
    );
    return success(res, data, 'Order updated');
  } catch (err) { return error(res, err.message, 400); }
};

// PATCH /api/v1/orders/:id/customer-items — customer edits their own
// order's items, but only while it's still 'pending' (not yet confirmed
// by admin) — matches the "edit until confirmed" window shown as an
// Edit button on My Orders / order detail. No ledger adjustment needed
// here since a pending order was never debited in the first place (see
// orders.service.js's updateOrderStatus — the debit only happens at the
// 'confirmed' transition).
const customerUpdateOrderItems = async (req, res) => {
  try {
    const { items, removed_ids, added_items } = req.body;
    const orders = await pgrestGet('orders', { select: 'id,status,customer_id,company_id', id: `eq.${req.params.id}` });
    const order = orders?.[0];
    if (!order) return error(res, 'Order not found', 404);
    if (order.customer_id !== req.user.id) return error(res, 'Access denied', 403);
    if (order.status !== 'pending') return error(res, 'This order can no longer be edited', 400);

    const data = await svc.updateOrderItems(
      req.params.id,
      order.company_id,
      { items: items || [], removedIds: removed_ids || [], addedItems: added_items || [] }
    );
    return success(res, data, 'Order updated');
  } catch (err) { return error(res, err.message, 400); }
};

const markInvoiceGenerated = async (req, res) => {
  try {
    const { with_tax, conveyance } = req.body;
    const data = await svc.markInvoiceGenerated(
      req.params.id,
      req.user.role === 'super_admin' ? null : req.user.company_id,
      { withTax: with_tax, conveyance }
    );
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

// DELETE /api/v1/orders/:id/invoice — any admin (super_admin or
// branch_admin, the latter restricted to their own branch's orders).
// Doubles as both "delete this order's invoice" (order kept visible,
// just loses its invoice) and "delete this order outright" (no invoice
// existed yet) — either way the order gets invoice_deleted_at set, which
// is what hides it from every normal Orders tab and surfaces it only
// under Deleted Invoices / the Deleted Items page. invoice_url/the
// Storage-backed generateInvoice flow in invoice.service.js is a
// separate, unused-by-the-desktop-UI mechanism, but is cleared too here
// for consistency since the schema carries both. A full snapshot is
// archived to deleted_invoices (sql/phase40) before any of this happens.
const deleteInvoice = async (req, res) => {
  try {
    const orders = await pgrestGet('orders', {
      select: '*,users:customer_id(full_name)',
      id: `eq.${req.params.id}`,
    });
    const order = orders?.[0];
    if (!order) return error(res, 'Order not found', 404);

    if (req.user.role === 'branch_admin' && order.company_id !== req.user.company_id) {
      return error(res, 'Access denied — this order belongs to a different branch', 403);
    }

    // deleted_invoices first (fails immediately if phase40 hasn't run) —
    // so a request that errors out never silently wipes the invoice with
    // no record of it. company_id (phase42) is what lets branch_admin's
    // view of this list be scoped to their own branch — fall back to the
    // plain row if that migration hasn't run yet.
    const deletedInvoiceRow = {
      original_order_id: order.id,
      order_number: order.order_number,
      customer_name: order.users?.full_name || 'Unknown',
      total_amount: order.total_amount,
      invoice_url: order.invoice_url || null,
      deleted_by: req.user.id,
      reason: req.body?.reason || null,
      original_data: order,
    };
    try {
      await pgrestPost('deleted_invoices', { ...deletedInvoiceRow, company_id: order.company_id });
    } catch (e) {
      await pgrestPost('deleted_invoices', deletedInvoiceRow);
    }

    // invoice_deleted_at (phase41) is what the frontend actually keys off
    // to show a locked "Deleted" status instead of letting "Create
    // Invoice" reappear right after deletion — invoice_with_tax/
    // invoice_conveyance are an older, phase28 addition. Both fall back
    // progressively if their migration hasn't run yet on this environment.
    const deletedAt = new Date().toISOString();
    try {
      await pgrestPatch('orders', { id: `eq.${order.id}` }, {
        invoice_url: null,
        invoice_generated_at: null,
        invoice_with_tax: false,
        invoice_conveyance: 0,
        invoice_deleted_at: deletedAt,
      });
    } catch (e) {
      try {
        await pgrestPatch('orders', { id: `eq.${order.id}` }, {
          invoice_url: null,
          invoice_generated_at: null,
          invoice_deleted_at: deletedAt,
        });
      } catch (e2) {
        await pgrestPatch('orders', { id: `eq.${order.id}` }, {
          invoice_url: null,
          invoice_generated_at: null,
        });
      }
    }

    const hadInvoice = !!(order.invoice_generated_at || order.invoice_url);
    return success(res, { deleted: true }, hadInvoice
      ? 'Invoice deleted and moved to Deleted Items'
      : 'Order deleted and moved to Deleted Items');
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/orders/deleted-invoices — any admin. branch_admin only
// ever sees their own branch's deleted orders/invoices; super_admin sees
// every branch (or one, via ?company_id=, same convention as every other
// list endpoint — see utils/companyScope.js).
const getDeletedInvoices = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: '*,deleted_by_user:users!deleted_by(full_name)',
      order: 'deleted_at.desc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;
    // company_id is a phase42 addition — fall back to the unscoped list
    // if it hasn't run yet (branch_admin would briefly see every branch's
    // rows until the migration runs, same graceful-degrade pattern used
    // everywhere else for a not-yet-migrated column).
    let data;
    try {
      data = await pgrestGet('deleted_invoices', params);
    } catch (e) {
      const { company_id, ...fallbackParams } = params;
      data = await pgrestGet('deleted_invoices', fallbackParams);
    }
    return success(res, data || []);
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/orders/:id/priority — a salesman flags their own
// customer's order as needing urgent delivery (admin/branch_admin can
// too). Separate from updateOrderStatus (admin-only, full status
// transitions) since this is a narrower, salesman-reachable action that
// only ever touches the priority flag — never status, stock, or ledger.
const setOrderPriority = async (req, res) => {
  try {
    const { priority } = req.body;
    if (!['urgent', 'normal'].includes(priority))
      return error(res, "priority must be 'urgent' or 'normal'", 400);

    const existingRows = await pgrestGet('orders', {
      select: 'id,order_number,company_id,salesman_id,customer_id,status,priority,users!customer_id(full_name)',
      id: `eq.${req.params.id}`,
    });
    const order = existingRows?.[0];
    if (!order) return error(res, 'Order not found', 404);

    if (req.user.role === 'salesman' && order.salesman_id !== req.user.id)
      return error(res, 'Access denied', 403);

    // Only meaningful once the order is actually confirmed and moving
    // through fulfillment — a still-'pending' order hasn't been accepted
    // yet, and a delivered/cancelled/undelivered one is already done.
    if (!['confirmed', 'preparing', 'dispatched'].includes(order.status))
      return error(res, `Cannot change priority on a ${order.status} order`, 400);

    const updated = await pgrestPatch('orders', { id: `eq.${req.params.id}` }, { priority });
    if (!updated?.[0]) return error(res, 'Failed to update priority', 400);

    if (priority === 'urgent' && order.priority !== 'urgent') {
      try {
        await pgrestPost('notifications', {
          company_id:     order.company_id,
          recipient_role: 'branch_admin',
          title:          'Urgent Order',
          body:           `Order ${order.order_number} for ${order.users?.full_name || 'a customer'} was flagged urgent — needs delivery ASAP.`,
          type:           'order_urgent',
        });
      } catch (e) { /* non-fatal */ }
    }

    return success(res, updated[0], 'Priority updated');
  } catch (err) { return error(res, err.message); }
};

module.exports = {
  createOrder, getOrders, getOrderById, updateOrderStatus, driverUpdateOrderStatus, updateOrderItems, customerUpdateOrderItems, markInvoiceGenerated,
  deleteInvoice, getDeletedInvoices, setOrderPriority,
};
