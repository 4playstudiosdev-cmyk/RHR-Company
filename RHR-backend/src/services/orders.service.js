const { supabaseAdmin }    = require('../config/supabase');
const { generateInvoice }  = require('./invoice.service');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');
const { qtyRuleFor } = require('../utils/orderQtyRules');
const { notifyUser } = require('./notify.service');

// Flat PKR 10 adjustment set on the customer's rate_tier at approval time
// (see the Rate Tier dialog on Customers.js / auth.service.js's
// approveCustomer) — 'discount' knocks 10 off, 'premium' adds 10, 'manual'
// (the default) leaves the listed price untouched. Clamped at 0 so a
// heavily-discounted, cheap item can't price negative.
const RATE_TIER_ADJUSTMENT = { manual: 0, discount: -10, premium: 10 };

async function createOrder({ customerId, salesmanId, companyId, items, notes, deliveryAddress, createdByRole, createdById }) {
  // Step 1: Validate all products exist and have enough stock. Routed
  // through the pgrestGet raw-https bypass (see utils/directQuery.js) —
  // these three reads were still on plain supabase-js, the exact pattern
  // that's intermittently returned a spurious empty result on Railway
  // elsewhere in this codebase; for customPrices specifically, an empty
  // result here silently fell through to the rate-tier price instead of
  // the customer's actual custom price, which is what looked like "custom
  // pricing isn't working" even though it had been saved correctly.
  const productIds = items.map(i => i.product_id);
  const [products, customerRows, customPrices, activeOrders, lastLedgerEntries] = await Promise.all([
    pgrestGet('products', {
      select: 'id,name,price,stock_quantity,categories(name)',
      id: `in.(${productIds.join(',')})`,
      company_id: `eq.${companyId}`,
      is_active: 'eq.true',
    }),
    pgrestGet('users', { select: 'rate_tier,full_name,credit_limit,salesman_id', id: `eq.${customerId}` }),
    // Per-customer, per-product override (Customers page → Set Custom
    // Pricing) — takes precedence over rate_tier for whichever products
    // it covers; anything not overridden still falls through to the
    // tier adjustment below.
    pgrestGet('customer_product_prices', {
      select: 'product_id,price',
      customer_id: `eq.${customerId}`,
      product_id: `in.(${productIds.join(',')})`,
    }),
    // One-order-at-a-time — applies regardless of who's placing it
    // (customer self-service, admin, or a salesman on the customer's
    // behalf): any order not yet in a terminal state counts as "still
    // out", including a failed 'undelivered' run, which needs
    // admin/driver follow-up before the slot frees up.
    pgrestGet('orders', {
      select: 'id,status',
      customer_id: `eq.${customerId}`,
      status: 'in.(pending,confirmed,preparing,dispatched)',
    }),
    // Credit limit check — current outstanding balance is the most
    // recent ledger_entries running_balance (debit-positive).
    pgrestGet('ledger_entries', {
      select: 'running_balance',
      customer_id: `eq.${customerId}`,
      order: 'created_at.desc',
      limit: '1',
    }),
  ]);
  const customer = customerRows?.[0];

  if (!products || products.length !== items.length) {
    throw new Error('One or more products not found');
  }

  if (activeOrders?.length) {
    throw new Error('This customer already has an order in progress — place a new one after it is delivered.');
  }

  const currentBalance = lastLedgerEntries?.[0]?.running_balance || 0;
  const creditLimit = customer?.credit_limit != null ? Number(customer.credit_limit) : null;

  const tierAdjustment = RATE_TIER_ADJUSTMENT[customer?.rate_tier] || 0;
  const customPriceByProduct = Object.fromEntries((customPrices || []).map(c => [c.product_id, Number(c.price)]));

  // Step 2: Build order items with price snapshot
  let totalAmount = 0;
  // Per-product minimum order quantity — Tile Bond (50), Grout (6),
  // Mapro Gray/White Cement (25), everything else normal (1). Mirrors
  // the frontend's lib/shared/order_qty_rules.dart so a direct API call
  // can't bypass what the UI itself enforces.
  const orderItems = items.map(item => {
    const product = products.find(p => p.id === item.product_id);
    const rule = qtyRuleFor(product.name, product.categories?.name);
    if (Number(item.quantity) < rule.min) {
      throw new Error(`Minimum order quantity for ${product.name} is ${rule.min} — you entered ${item.quantity}`);
    }
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

  if (creditLimit != null && creditLimit > 0 && currentBalance + totalAmount > creditLimit) {
    const remaining = Math.max(0, creditLimit - currentBalance);
    throw new Error(
      `This order exceeds your credit limit. You can order up to PKR ${remaining.toLocaleString()} more — ` +
      `clear your outstanding balance to free up more credit.`
    );
  }

  // Step 3: Create the order
  const date    = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const randPart = Math.floor(1000 + Math.random() * 9000);
  const orderNumber = `ORD-${datePart}-${randPart}`;

  // Whoever placed the order (customer self-service, admin on their behalf,
  // or the assigned salesman themselves), the order still belongs to this
  // customer's salesman — so it must show up in that salesman's "My
  // Orders", not just when the salesman was the one who clicked Create.
  const effectiveSalesmanId = salesmanId || customer?.salesman_id || null;

  const orderRow = {
    company_id:       companyId,
    customer_id:      customerId,
    salesman_id:      effectiveSalesmanId,
    order_number:     orderNumber,
    total_amount:     totalAmount,
    notes,
    delivery_address: deliveryAddress
  };

  // created_by_role/created_by_id are a phase61 addition — who actually
  // placed the order (admin / salesman / customer), independent of
  // salesman_id above (always the customer's assigned salesman, not
  // necessarily the creator). Falls back to inserting without them if
  // that migration hasn't run yet, same pattern used elsewhere in this
  // codebase for new columns on an already-live table.
  let order;
  try {
    const { data, error: oErr } = await supabaseAdmin
      .from('orders')
      .insert({ ...orderRow, created_by_role: createdByRole || null, created_by_id: createdById || null })
      .select()
      .single();
    if (oErr) throw new Error(oErr.message);
    order = data;
  } catch (e) {
    const { data, error: oErr } = await supabaseAdmin
      .from('orders')
      .insert(orderRow)
      .select()
      .single();
    if (oErr) throw new Error(oErr.message);
    order = data;
  }

  // Step 4: Insert order items
  const { error: iErr } = await supabaseAdmin
    .from('order_items')
    .insert(orderItems.map(item => ({ ...item, order_id: order.id })));

  if (iErr) throw new Error(iErr.message);

  // Stock is no longer deducted here — it leaves inventory when the
  // order is actually marked delivered (see deductDeliveredStock below),
  // not the moment it's placed. The stock_quantity check above still
  // guards against ordering more than what's currently on hand.

  // Best-effort — a notification failure should never block the order
  // itself. recipient_role: 'branch_admin' + company_id scopes this to
  // the branch the order actually belongs to (getMyNotifications filters
  // branch_admin by their own company_id); super_admin sees every
  // branch's notifications regardless of recipient_role, so this reaches
  // them too without a separate insert.
  try {
    await supabaseAdmin.from('notifications').insert({
      company_id:     companyId,
      recipient_role: 'branch_admin',
      title:          'New Order',
      body:           `${customer?.full_name || 'A customer'} placed order ${orderNumber} — PKR ${totalAmount.toLocaleString()}`,
      type:           'order',
    });
  } catch (e) { /* non-fatal */ }

  // Also notify the customer's own salesman directly — unless the
  // salesman is the one who just placed this order themselves, in
  // which case they obviously already know.
  if (effectiveSalesmanId && !(createdByRole === 'salesman' && createdById === effectiveSalesmanId)) {
    await notifyUser({
      companyId,
      recipientId: effectiveSalesmanId,
      title: 'New Order',
      body: `${customer?.full_name || 'Your customer'} placed order ${orderNumber} — PKR ${totalAmount.toLocaleString()}`,
      type: 'order',
    });
  }

  return order;
}

async function getOrders(user, companyIdOverride) {
  let query = supabaseAdmin
    .from('orders')
    .select('*, order_items(id, product_id, product_name, quantity, unit_price, subtotal, products(image_url)), users!customer_id(full_name, phone, salesman_id, profile_photo_url), drivers(full_name, car_number, phone)')
    .order('created_at', { ascending: false });

  if (user.role === 'customer') {
    query = query.eq('customer_id', user.id);
  } else if (user.role === 'salesman') {
    query = query.eq('salesman_id', user.id);
  } else if (user.role === 'driver') {
    // The driver dashboard shows both what's still out for delivery and
    // what's already been completed (a "Delivered" section, so a driver
    // can see their own history, not just the live to-do list) — the
    // frontend splits these by status client-side.
    query = query.eq('driver_id', user.id).in('status', ['dispatched', 'delivered', 'undelivered']);
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

  let result = (data || []).map((o) => ({ ...o, paid_amount: paidByOrder[o.id] || 0 }));

  // Urgent orders float to the top of a driver's list — impossible to
  // miss among their other deliveries (the frontend also blinks the
  // badge). created_at desc still breaks ties within each priority.
  if (user.role === 'driver') {
    result = result.sort((a, b) => {
      if (a.priority === b.priority) return 0;
      return a.priority === 'urgent' ? -1 : (b.priority === 'urgent' ? 1 : 0);
    });
  }

  return result;
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
    .select('*, order_items(*, products(unit, image_url)), users!customer_id(full_name, phone, shop_name, shop_address, shop_latitude, shop_longitude, profile_photo_url), drivers(full_name, car_number, phone), salesmen!salesman_id(full_name, phone)')
    .eq('id', id)
    .single();
  let { data, error } = await query;
  if (error) {
    ({ data, error } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*), users!customer_id(full_name, phone, shop_name, shop_address, shop_latitude, shop_longitude, profile_photo_url)')
      .eq('id', id)
      .single());
  }
  if (error) throw new Error('Order not found');

  // Security check
  if (user.role === 'customer' && data.customer_id !== user.id)
    throw new Error('Access denied');
  if (user.role === 'salesman' && data.salesman_id !== user.id)
    throw new Error('Access denied');
  if (user.role === 'driver' && data.driver_id !== user.id)
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
  if (to === 'cancelled') return from !== 'delivered' && from !== 'cancelled' && from !== 'undelivered';
  // 'undelivered' is the driver's own "Cancel" action on the delivery
  // run — only meaningful once an order is actually out with them, and
  // terminal like 'delivered'/'cancelled' (no further status changes).
  if (to === 'undelivered') return from === 'dispatched';
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
  const validStatuses = ['confirmed', 'preparing', 'dispatched', 'delivered', 'undelivered', 'cancelled'];
  if (!validStatuses.includes(status))
    throw new Error('Invalid status. Must be one of: ' + validStatuses.join(', '));

  const existingRows = await pgrestGet('orders', { select: 'id,status,company_id,driver_id', id: `eq.${id}` });
  if (!existingRows?.[0]) throw new Error('Order not found');

  if (!isValidTransition(existingRows[0].status, status))
    throw new Error(`Cannot move an order from "${existingRows[0].status}" to "${status}"`);

  const { driverId, carNumber, deliveryAddress, deliveredBags, returnedBags, deliveryNotes, priority, amountCollected, collectingDriverId } = dispatchInfo;
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
  // Driver's delivery-confirmation counts — informational for admin to
  // double-check against, not tied to the stock deduction below (which
  // still deducts the full ordered quantity, same as before this field
  // existed; reconciling partial-return stock is a separate concern).
  if (deliveredBags != null) patchBody.delivered_bags = Number(deliveredBags);
  if (returnedBags != null)  patchBody.returned_bags = Number(returnedBags);
  if (deliveryNotes != null) patchBody.delivery_notes = deliveryNotes;
  if (priority != null)      patchBody.priority = priority === 'urgent' ? 'urgent' : 'normal';
  if (amountCollected != null) patchBody.amount_collected = Number(amountCollected);

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

    // Debits the customer's ledger for the order total — this was
    // missing entirely before (confirmed orders never appeared in the
    // ledger anywhere, admin/salesman/customer alike, since nothing
    // else in the order lifecycle wrote a ledger_entries row for the
    // order amount itself, only for cash collected after the fact).
    // Same running-balance pattern as creditLedger in recovery.routes.js.
    try {
      // Idempotency guard: a double-click/retry of the confirm action can
      // race past isValidTransition (both requests read 'pending' before
      // either PATCH lands), each posting its own debit and doubling the
      // customer's balance for one order. Checking for an existing debit
      // keyed to this order closes that window.
      const existingDebit = await pgrestGet('ledger_entries', {
        select: 'id',
        reference_type: 'eq.order',
        reference_id: `eq.${updated.id}`,
        entry_type: 'eq.debit',
      });
      if (!existingDebit?.length) {
        const lastEntries = await pgrestGet('ledger_entries', {
          select: 'running_balance',
          customer_id: `eq.${updated.customer_id}`,
          order: 'created_at.desc',
          limit: '1',
        });
        const prevBalance = lastEntries?.[0]?.running_balance || 0;
        await pgrestPost('ledger_entries', {
          company_id: updated.company_id,
          customer_id: updated.customer_id,
          entry_type: 'debit',
          amount: Number(updated.total_amount),
          running_balance: prevBalance + Number(updated.total_amount),
          description: `Order ${updated.order_number} confirmed`,
          reference_type: 'order',
          reference_id: updated.id,
          created_by: null,
        });
      }
    } catch (err) {
      console.error(`Ledger debit for confirmed order ${id} failed:`, err.message);
    }
  }

  // Cancelling an order that had already been confirmed (and therefore
  // already debited above) must reverse that debit — otherwise the
  // customer's outstanding balance keeps counting an order that's no
  // longer actually owed. existingRows[0].status is the status *before*
  // this transition, so this only fires when the order had actually
  // reached 'confirmed' or later (a still-'pending' order was never
  // debited in the first place, so cancelling it needs no reversal).
  if (status === 'cancelled' && STATUS_PROGRESSION.indexOf(existingRows[0].status) >= STATUS_PROGRESSION.indexOf('confirmed')) {
    try {
      const lastEntries = await pgrestGet('ledger_entries', {
        select: 'running_balance',
        customer_id: `eq.${updated.customer_id}`,
        order: 'created_at.desc',
        limit: '1',
      });
      const prevBalance = lastEntries?.[0]?.running_balance || 0;
      await pgrestPost('ledger_entries', {
        company_id: updated.company_id,
        customer_id: updated.customer_id,
        entry_type: 'credit',
        amount: Number(updated.total_amount),
        running_balance: prevBalance - Number(updated.total_amount),
        description: `Order ${updated.order_number} cancelled — debit reversed`,
        reference_type: 'order',
        reference_id: updated.id,
        created_by: null,
      });
    } catch (err) {
      console.error(`Ledger reversal for cancelled order ${id} failed:`, err.message);
    }
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

    // Cash-on-delivery collected at the door — credits the customer's
    // ledger immediately, same running-balance pattern as
    // recovery.routes.js's creditLedger (duplicated here rather than
    // imported — this module has no existing dependency on that route
    // file and the logic is a few lines).
    if (amountCollected != null && Number(amountCollected) > 0) {
      try {
        const lastEntries = await pgrestGet('ledger_entries', {
          select: 'running_balance',
          customer_id: `eq.${updated.customer_id}`,
          order: 'created_at.desc',
          limit: '1',
        });
        const prevBalance = lastEntries?.[0]?.running_balance || 0;
        await pgrestPost('ledger_entries', {
          company_id: updated.company_id,
          customer_id: updated.customer_id,
          entry_type: 'credit',
          amount: Number(amountCollected),
          running_balance: prevBalance - Number(amountCollected),
          description: `Cash collected on delivery — order ${updated.order_number}`,
          reference_type: 'delivery',
          created_by: null, // driver's own id isn't a `users` row — see recovery.routes.js's identical FK note
        });
      } catch (err) {
        console.error(`Ledger credit for delivered order ${id} failed:`, err.message);
      }

      // Also logs this as a driver cash collection (same salesman_recoveries
      // table the Cash Collection screen's "Cash In Hand" reads — see
      // recovery.routes.js's /driver-transactions/me) so the money the
      // driver is now holding shows up there to be deposited later, same
      // as a salesman's manual collection would.
      if (collectingDriverId) {
        try {
          await pgrestPost('salesman_recoveries', {
            company_id: updated.company_id,
            driver_id: collectingDriverId,
            customer_id: updated.customer_id,
            amount: Number(amountCollected),
            payment_type: 'cash',
            payment_method: 'cash',
            reference_number: null,
            notes: `Collected on delivery — order ${updated.order_number}`,
            status: 'approved',
            approved_by: null,
            approved_at: new Date().toISOString(),
            recovery_date: new Date().toISOString().split('T')[0],
            created_by: null,
          });
        } catch (err) {
          console.error(`Cash-in-hand log for delivered order ${id} failed:`, err.message);
        }
      }

      // Let the customer's own salesman know a driver just collected cash
      // on their behalf — they weren't present for it, so it wouldn't show
      // up on their radar otherwise.
      if (updated.salesman_id) {
        await notifyUser({
          companyId: updated.company_id,
          recipientId: updated.salesman_id,
          title: 'Payment Collected',
          body: `Driver collected PKR ${Number(amountCollected).toLocaleString()} on delivery of order ${updated.order_number}`,
          type: 'payment',
        });
      }
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
async function updateOrderItems(orderId, companyId, { items = [], removedIds = [], addedItems = [] }) {
  const filter = { id: `eq.${orderId}` };
  if (companyId) filter.company_id = `eq.${companyId}`;
  const orders = await pgrestGet('orders', { select: 'id,status,customer_id,company_id', ...filter });
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

  // New lines the customer added at the last minute — priced the same
  // way createOrder does (custom price override, else rate-tier
  // adjustment on the catalog price), so an added item isn't charged
  // differently than if it had been on the order from the start.
  if (addedItems.length > 0) {
    const productIds = addedItems.map((i) => i.product_id);
    // Same raw-https bypass as createOrder above, and for the same reason
    // — these were still on plain supabase-js.
    const [products, customerRows, customPrices] = await Promise.all([
      pgrestGet('products', { select: 'id,name,price,stock_quantity', id: `in.(${productIds.join(',')})`, company_id: `eq.${order.company_id}` }),
      pgrestGet('users', { select: 'rate_tier', id: `eq.${order.customer_id}` }),
      pgrestGet('customer_product_prices', { select: 'product_id,price', customer_id: `eq.${order.customer_id}`, product_id: `in.(${productIds.join(',')})` }),
    ]);
    const customer = customerRows?.[0];
    const tierAdjustment = RATE_TIER_ADJUSTMENT[customer?.rate_tier] || 0;
    const customPriceByProduct = Object.fromEntries((customPrices || []).map((c) => [c.product_id, Number(c.price)]));

    for (const { product_id, quantity } of addedItems) {
      const product = (products || []).find((p) => p.id === product_id);
      if (!product || !quantity || Number(quantity) <= 0) continue;
      if (isDelivered && Number(product.stock_quantity) < Number(quantity))
        throw new Error(`Insufficient stock for ${product.name} — only ${product.stock_quantity} available`);

      const hasCustomPrice = product_id in customPriceByProduct;
      const unitPrice = hasCustomPrice ? customPriceByProduct[product_id] : Math.max(0, Number(product.price) + tierAdjustment);
      const qty = Number(quantity);

      await pgrestPost('order_items', {
        order_id: orderId,
        product_id,
        product_name: product.name,
        unit_price: unitPrice,
        quantity: qty,
        subtotal: unitPrice * qty,
      });
      if (isDelivered) await applyStockDelta(product_id, qty);
    }
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
