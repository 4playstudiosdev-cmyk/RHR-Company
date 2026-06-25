const svc = require('../services/orders.service');
const { success, error } = require('../utils/response');

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
    const data = await svc.getOrders(req.user);
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
    const { status } = req.body;
    if (!status) return error(res, 'status is required', 400);
    const data = await svc.updateOrderStatus(req.params.id, req.user.company_id, status);
    return success(res, data, `Order status updated to ${status}`);
  } catch (err) {
    console.log('ERROR:', err.message);
    return error(res, err.message, 400);
  }
};

module.exports = { createOrder, getOrders, getOrderById, updateOrderStatus };
