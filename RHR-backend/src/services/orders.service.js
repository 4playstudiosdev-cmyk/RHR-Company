const { supabaseAdmin }    = require('../config/supabase');
const { generateInvoice }  = require('./invoice.service');
const { pgrestGet, pgrestPatch } = require('../utils/directQuery');

// Flat PKR 10 adjustment set on the customer's rate_tier at approval time
// (see the Rate Tier dialog on Customers.js / auth.service.js's
// approveCustomer) — 'discount' knocks 10 off, 'premium' adds 10, 'manual'
// (the default) leaves the listed price untouched. Clamped at 0 so a
// heavily-discounted, cheap item can't price negative.
const RATE_TIER_ADJUSTMENT = { manual: 0, discount: -10, premium: 10 };

async function createOrder({ customerId, salesmanId, companyId, items, notes, deliveryAddress }) {
  // Step 1: Validate all products exist and have enough stock
  const productIds = items.map(i => i.product_id);
  const [{ data: products, error: pErr }, { data: customer }, { data: customPrices }] = await Promise.all([
    supabaseAdmin
      .from('products')
      .select('id, name, price, stock_quantity')
      .in('id', productIds)
      .eq('company_id', companyId)
      .eq('is_active', true),
    supabaseAdmin
      .from('users')
      .select('rate_tier')
      .eq('id', customerId)
      .maybeSingle(),
    // Per-customer, per-product override (Customers page → Set Custom
    // Pricing) — takes precedence over rate_tier for whichever products
    // it covers; anything not overridden still falls through to the
    // tier adjustment below.
    supabaseAdmin
      .from('customer_product_prices')
      .select('product_id, price')
      .eq('customer_id', customerId)
      .in('product_id', productIds)
  ]);

  if (pErr || products.length !== items.length) {
    throw new Error('One or more products not found');
  }

  const tierAdjustment = RATE_TIER_ADJUSTMENT[customer?.rate_tier] || 0;
  const customPriceByProduct = Object.fromEntries((customPrices || []).map(c => [c.product_id, Number(c.price)]));

  // Step 2: Build order items with price snapshot
  let totalAmount = 0;
  const orderItems = items.map(item => {
    const product = products.find(p => p.id === item.product_id);
    if (product.stock_quantity < item.quantity) {
      throw new Error(`Insufficient stock for ${product.name}`);
    }
    const hasCustomPrice = item.product_id in customPriceByProduct;
    const unitPrice = hasCustomPrice
      ? customPriceByProduct[item.product_id]
      : Math.max(0, Number(product.price) + tierAdjustment);
    const subtotal = unitPrice * item.quantity;
    totalAmount += subtotal;
    return {
      product_id:   item.product_id,
      product_name: product.name,
      unit_price:   unitPrice,
      quantity:     item.quantity,
      subtotal
    };
  });

  // Step 3: Create the order
  const date    = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const randPart = Math.floor(1000 + Math.random() * 9000);
  const orderNumber = `ORD-${datePart}-${randPart}`;

  const { data: order, error: oErr } = await supabaseAdmin
    .from('orders')
    .insert({
      company_id:       companyId,
      customer_id:      customerId,
      salesman_id:      salesmanId || null,
      order_number:     orderNumber,
      total_amount:     totalAmount,
      notes,
      delivery_address: deliveryAddress
    })
    .select()
    .single();

  if (oErr) throw new Error(oErr.message);

  // Step 4: Insert order items
  const { error: iErr } = await supabaseAdmin
    .from('order_items')
    .insert(orderItems.map(item => ({ ...item, order_id: order.id })));

  if (iErr) throw new Error(iErr.message);

  // Stock is no longer deducted here — it leaves inventory when the
  // order is actually marked delivered (see deductDeliveredStock below),
  // not the moment it's placed. The stock_quantity check above still
  // guards against ordering more than what's currently on hand.

  return order;
}

async function getOrders(user, companyIdOverride) {
  let query = supabaseAdmin
    .from('orders')
    .select('*, order_items(product_name, quantity, unit_price, subtotal), users!customer_id(full_name, phone, salesman_id)')
    .order('created_at', { ascending: false });

  if (user.role === 'customer') {
    query = query.eq('customer_id', user.id);
  } else if (user.role === 'salesman') {
    query = query.eq('salesman_id', user.id);
  } else if (companyIdOverride) {
    // Admin — companyIdOverride is null for super_admin's "All Cities"
    // (see resolveCompanyId in utils/companyScope.js), which means no
    // filter at all here — every branch's orders at once.
    query = query.eq('company_id', companyIdOverride);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Paid total per order (approved payments only). payments.order_id
  // isn't set up for a PostgREST embed, so resolved by hand — same
  // small-dataset-N+1 tradeoff already made for recipe labels in
  // production.routes.js.
  const orderIds = (data || []).map((o) => o.id);
  let paidByOrder = {};
  if (orderIds.length) {
    const { data: payments } = await supabaseAdmin
      .from('payments')
      .select('order_id, amount')
      .in('order_id', orderIds)
      .eq('status', 'approved');
    (payments || []).forEach((p) => {
      paidByOrder[p.order_id] = (paidByOrder[p.order_id] || 0) + Number(p.amount);
    });
  }

  return (data || []).map((o) => ({ ...o, paid_amount: paidByOrder[o.id] || 0 }));
}

async function getOrderById(id, user) {
  // order_items already carries product_name/unit_price/subtotal as a
  // price-snapshot at order time (see createOrder above) — the products
  // embed here is just for the unit label (kg/bag/etc), which isn't
  // snapshotted. Falls back to the plain select if that embed ever fails
  // (e.g. a product later deleted breaks the join), so order detail
  // still loads without it.
  let query = supabaseAdmin
    .from('orders')
    .select('*, order_items(*, products(unit)), users!customer_id(full_name, phone, shop_name, shop_address), drivers(full_name, car_number, phone)')
    .eq('id', id)
    .single();
  let { data, error } = await query;
  if (error) {
    ({ data, error } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*), users!customer_id(full_name, phone, shop_name, shop_address)')
      .eq('id', id)
      .single());
  }
  if (error) throw new Error('Order not found');

  // Security check
  if (user.role === 'customer' && data.customer_id !== user.id)
    throw new Error('Access denied');
  if (user.role === 'salesman' && data.salesman_id !== user.id)
    throw new Error('Access denied');

  return data;
}

// Forward-only progression — an order can only move ahead (or to
// 'cancelled' from any non-terminal state), never back to an
// already-passed stage. 'delivered' and 'cancelled' are terminal: once
// there, no further status changes. Enforced here (not just hidden in
// the Orders.js dropdown) so a direct API call can't skip it either.
const STATUS_PROGRESSION = ['pending', 'confirmed', 'preparing', 'dispatched', 'delivered'];

function isValidTransition(from, to) {
  if (to === 'cancelled') return from !== 'delivered' && from !== 'cancelled';
  const fromIdx = STATUS_PROGRESSION.indexOf(from);
  const toIdx = STATUS_PROGRESSION.indexOf(to);
  return fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx;
}

// dispatchInfo: { driverId, carNumber, deliveryAddress } — optional,
// only meaningful when status is 'dispatched' (see the Orders.js dispatch
// popup). driver_id/car_number are a phase20 addition on orders — the
// update falls back to plain status-only if that migration hasn't run
// yet, so advancing status still works either way.
async function updateOrderStatus(id, companyId, status, dispatchInfo = {}) {
  const validStatuses = ['confirmed', 'preparing', 'dispatched', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status))
    throw new Error('Invalid status. Must be one of: ' + validStatuses.join(', '));

  const existingRows = await pgrestGet('orders', { select: 'id,status,company_id', id: `eq.${id}` });
  if (!existingRows?.[0]) throw new Error('Order not found');

  if (!isValidTransition(existingRows[0].status, status))
    throw new Error(`Cannot move an order from "${existingRows[0].status}" to "${status}"`);

  const { driverId, carNumber, deliveryAddress } = dispatchInfo;
  if (driverId) {
    const drivers = await pgrestGet('drivers', {
      select: 'id',
      id: `eq.${driverId}`,
      company_id: `eq.${existingRows[0].company_id}`,
    });
    if (!drivers?.[0]) throw new Error('Driver not found in this order\'s branch');
  }

  const patchBody = { status };
  if (deliveryAddress !== undefined) patchBody.delivery_address = deliveryAddress;

  let updated;
  try {
    const rows = await pgrestPatch('orders', { id: `eq.${id}` }, {
      ...patchBody,
      ...(driverId ? { driver_id: driverId } : {}),
      ...(carNumber ? { car_number: carNumber } : {}),
    });
    updated = rows?.[0];
  } catch (e) {
    const rows = await pgrestPatch('orders', { id: `eq.${id}` }, patchBody);
    updated = rows?.[0];
  }
  if (!updated) throw new Error('Order updated but failed to fetch result');

  // Auto-generate invoice when order is confirmed
  if (status === 'confirmed') {
    generateInvoice(id).catch(err =>
      console.error('Background invoice generation failed:', err.message)
    );
  }

  // Stock leaves inventory when the order actually goes out the door, not
  // when it's placed — createOrder above only checks availability now, it
  // doesn't deduct. This also means a cancelled order never needs stock
  // restored, since nothing was taken from it in the first place. Awaited
  // (unlike the invoice generation above) since inventory correctness
  // matters more than this one request staying fast — a failure here
  // still doesn't undo the status change already saved, just gets logged.
  if (status === 'delivered') {
    try {
      await deductDeliveredStock(id);
    } catch (err) {
      console.error(`Stock deduction for delivered order ${id} failed:`, err.message);
    }
  }

  return updated;
}

async function deductDeliveredStock(orderId) {
  const items = await pgrestGet('order_items', {
    select: 'product_id,quantity',
    order_id: `eq.${orderId}`,
  });
  for (const item of items || []) {
    if (!item.product_id) continue;
    const products = await pgrestGet('products', { select: 'id,stock_quantity', id: `eq.${item.product_id}` });
    const product = products?.[0];
    if (!product) continue;
    await pgrestPatch('products', { id: `eq.${item.product_id}` }, {
      stock_quantity: Math.max(0, Number(product.stock_quantity) - Number(item.quantity)),
    });
  }
}

// Lets an admin correct an order's line items before invoicing — some
// customers change their mind on quantity right before delivery. `items`
// is [{ item_id, quantity }] for lines to update; `removedIds` are line
// items to drop entirely. If the order's already 'delivered' (stock was
// already deducted at that transition — see deductDeliveredStock above),
// the product stock is adjusted by the delta so it stays correct either
// way; for any earlier status nothing has been deducted yet, so editing
// here just changes what deduction will happen later.
async function updateOrderItems(orderId, companyId, { items = [], removedIds = [] }) {
  const filter = { id: `eq.${orderId}` };
  if (companyId) filter.company_id = `eq.${companyId}`;
  const orders = await pgrestGet('orders', { select: 'id,status', ...filter });
  const order = orders?.[0];
  if (!order) throw new Error('Order not found or access denied');

  const existingItems = await pgrestGet('order_items', {
    select: 'id,product_id,quantity,unit_price',
    order_id: `eq.${orderId}`,
  });
  const itemById = Object.fromEntries((existingItems || []).map((it) => [it.id, it]));
  const isDelivered = order.status === 'delivered';

  const applyStockDelta = async (productId, delta) => {
    if (!productId || !delta) return;
    const products = await pgrestGet('products', { select: 'id,stock_quantity', id: `eq.${productId}` });
    const product = products?.[0];
    if (!product) return;
    await pgrestPatch('products', { id: `eq.${productId}` }, {
      stock_quantity: Math.max(0, Number(product.stock_quantity) - delta),
    });
  };

  for (const id of removedIds) {
    const existing = itemById[id];
    if (!existing) continue;
    // Removing a line means it's no longer sold — give the full quantity
    // back to stock if it had already been deducted at delivery.
    if (isDelivered) await applyStockDelta(existing.product_id, -Number(existing.quantity));
    await supabaseAdmin.from('order_items').delete().eq('id', id);
    delete itemById[id];
  }

  for (const { item_id, quantity } of items) {
    const existing = itemById[item_id];
    if (!existing || quantity == null || Number(quantity) < 0) continue;
    const newQty = Number(quantity);
    const delta = newQty - Number(existing.quantity);
    if (delta === 0) continue;

    if (isDelivered && delta > 0) {
      const products = await pgrestGet('products', { select: 'stock_quantity', id: `eq.${existing.product_id}` });
      const available = Number(products?.[0]?.stock_quantity || 0);
      if (available < delta)
        throw new Error(`Insufficient stock to increase this line — only ${available} more available`);
    }

    await pgrestPatch('order_items', { id: `eq.${item_id}` }, {
      quantity: newQty,
      subtotal: newQty * Number(existing.unit_price),
    });
    itemById[item_id] = { ...existing, quantity: newQty };
    if (isDelivered) await applyStockDelta(existing.product_id, delta);
  }

  const remaining = await pgrestGet('order_items', { select: 'subtotal', order_id: `eq.${orderId}` });
  const newTotal = (remaining || []).reduce((sum, it) => sum + Number(it.subtotal), 0);
  await pgrestPatch('orders', { id: `eq.${orderId}` }, { total_amount: newTotal });

  return getOrderById(orderId, { role: 'super_admin', id: null, company_id: null });
}

// Marks that an invoice now exists for this order — the Orders.js
// "Create Invoice" button switches to "Edit Invoice" once this is set,
// falling back to no-op if invoice_generated_at (a phase23 addition)
// hasn't been migrated yet, so invoice generation itself never breaks.
async function markInvoiceGenerated(id, companyId, { withTax, conveyance } = {}) {
  const filter = { id: `eq.${id}` };
  if (companyId) filter.company_id = `eq.${companyId}`;
  const baseBody = { invoice_generated_at: new Date().toISOString() };
  // invoice_with_tax/invoice_conveyance are a phase28 addition — fall
  // back to just the timestamp if that migration hasn't run yet.
  try {
    const rows = await pgrestPatch('orders', filter, {
      ...baseBody,
      invoice_with_tax: !!withTax,
      invoice_conveyance: Number(conveyance) || 0,
    });
    return rows?.[0] || null;
  } catch (e) {
    try {
      const rows = await pgrestPatch('orders', filter, baseBody);
      return rows?.[0] || null;
    } catch (e2) {
      return null;
    }
  }
}

module.exports = { createOrder, getOrders, getOrderById, updateOrderStatus, updateOrderItems, markInvoiceGenerated };
