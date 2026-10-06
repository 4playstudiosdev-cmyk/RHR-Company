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
      deliveryAddress: delivery_address
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
    const { status, driver_id, car_number, delivery_address } = req.body;
    if (!status) return error(res, 'status is required', 400);
    const data = await svc.updateOrderStatus(req.params.id, req.user.company_id, status, {
      driverId: driver_id,
      carNumber: car_number,
      deliveryAddress: delivery_address,
    });
    return success(res, data, `Order status updated to ${status}`);
  } catch (err) {
    console.log('ERROR:', err.message);
    return error(res, err.message, 400);
  }
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

// DELETE /api/v1/orders/:id/invoice — super_admin only. Orders.js tracks
// "has an invoice" via invoice_generated_at (set by markInvoiceGenerated
// above, client-side jsPDF generation) — invoice_url/the Storage-backed
// generateInvoice flow in invoice.service.js is a separate, unused-by-
// the-desktop-UI mechanism, but is cleared too here for consistency since
// the schema carries both. The order itself is kept; only the invoice
// state is wiped, after being archived to deleted_invoices (sql/phase40).
const deleteInvoice = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return error(res, 'Access denied — super admin only', 403);
    }

    const orders = await pgrestGet('orders', {
      select: '*,users:customer_id(full_name)',
      id: `eq.${req.params.id}`,
    });
    const order = orders?.[0];
    if (!order) return error(res, 'Order not found', 404);
    if (!order.invoice_generated_at && !order.invoice_url) {
      return error(res, 'This order has no invoice to delete', 400);
    }

    // deleted_invoices first (fails immediately if phase40 hasn't run) —
    // so a request that errors out never silently wipes the invoice with
    // no record of it.
    await pgrestPost('deleted_invoices', {
      original_order_id: order.id,
      order_number: order.order_number,
      customer_name: order.users?.full_name || 'Unknown',
      total_amount: order.total_amount,
      invoice_url: order.invoice_url || null,
      deleted_by: req.user.id,
      reason: req.body?.reason || null,
      original_data: order,
    });

    // invoice_with_tax/invoice_conveyance are a phase28 addition — fall
    // back to just the core fields if that migration hasn't run yet.
    try {
      await pgrestPatch('orders', { id: `eq.${order.id}` }, {
        invoice_url: null,
        invoice_generated_at: null,
        invoice_with_tax: false,
        invoice_conveyance: 0,
      });
    } catch (e) {
      await pgrestPatch('orders', { id: `eq.${order.id}` }, {
        invoice_url: null,
        invoice_generated_at: null,
      });
    }

    return success(res, { deleted: true }, 'Invoice deleted and moved to deleted invoices record');
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/orders/deleted-invoices — super_admin only
const getDeletedInvoices = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return error(res, 'Access denied', 403);
    }
    const data = await pgrestGet('deleted_invoices', {
      select: '*,deleted_by_user:users!deleted_by(full_name)',
      order: 'deleted_at.desc',
    });
    return success(res, data || []);
  } catch (err) { return error(res, err.message); }
};

module.exports = {
  createOrder, getOrders, getOrderById, updateOrderStatus, updateOrderItems, markInvoiceGenerated,
  deleteInvoice, getDeletedInvoices,
};
