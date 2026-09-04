const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// ─────────────────────────────────────
// GET /api/v1/transfers
// List all transfers — filtered by role
// ─────────────────────────────────────
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const user = req.user;
    let query = supabaseAdmin
      .from('stock_transfers')
      .select(`
        *,
        products(id, name, unit),
        from_company:companies!from_company_id(id, name, city),
        to_company:companies!to_company_id(id, name, city)
      `)
      .order('created_at', { ascending: false });

    // Branch admin sees only their transfers
    if (user.role === 'branch_admin') {
      query = query.or(
        `from_company_id.eq.${user.company_id},to_company_id.eq.${user.company_id}`
      );
    }
    // Super admin sees all

    const { data, error: dbErr } = await query;
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// ─────────────────────────────────────
// GET /api/v1/transfers/pending
// Transfers waiting to be received by this branch
// (registered before /:id-shaped routes even though there are none yet,
// so a future GET /:id can't ever shadow this literal path)
// ─────────────────────────────────────
router.get('/pending', authenticate, isAdmin, async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('stock_transfers')
      .select(`
        *,
        products(id, name, unit),
        from_company:companies!from_company_id(id, name, city)
      `)
      .eq('to_company_id', req.user.company_id)
      .eq('status', 'dispatched')
      .order('created_at', { ascending: false });

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// ─────────────────────────────────────
// POST /api/v1/transfers
// Create new transfer — deduct from source branch stock
// ─────────────────────────────────────
router.post('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { to_company_id, product_id, quantity, notes } = req.body;

    if (!to_company_id || !product_id || !quantity)
      return error(res, 'to_company_id, product_id, quantity are required', 400);

    const user = req.user;

    // Branch admins can only ever send from their own branch. Super admin
    // has no company_id of their own (same convention as payments.service.js
    // reviewPayment), so they must name the sending branch explicitly.
    let from_company_id;
    if (user.role === 'branch_admin') {
      from_company_id = user.company_id;
    } else {
      from_company_id = req.body.from_company_id;
      if (!from_company_id) return error(res, 'from_company_id is required', 400);
    }

    // Cannot transfer to same branch
    if (from_company_id === to_company_id)
      return error(res, 'Cannot transfer to same branch', 400);

    // Check source product stock
    const { data: sourceProduct } = await supabaseAdmin
      .from('products')
      .select('id, name, stock_quantity, unit')
      .eq('id', product_id)
      .eq('company_id', from_company_id)
      .single();

    if (!sourceProduct)
      return error(res, 'Product not found in your branch', 404);

    if (Number(sourceProduct.stock_quantity) < Number(quantity))
      return error(res,
        `Insufficient stock — available: ${sourceProduct.stock_quantity} ${sourceProduct.unit}`,
        400
      );

    // Deduct from source branch stock
    await supabaseAdmin
      .from('products')
      .update({
        stock_quantity: Number(sourceProduct.stock_quantity) - Number(quantity)
      })
      .eq('id', product_id)
      .eq('company_id', from_company_id);

    // Create transfer record
    const { data: transfer, error: dbErr } = await supabaseAdmin
      .from('stock_transfers')
      .insert({
        from_company_id,
        to_company_id,
        product_id,
        quantity:   Number(quantity),
        status:     'dispatched',
        notes:      notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, transfer, 'Stock transferred — awaiting receipt', 201);
  } catch (err) { return error(res, err.message); }
});

// ─────────────────────────────────────
// PATCH /api/v1/transfers/:id/receive
// Receive transfer — add to destination branch stock
// ─────────────────────────────────────
router.patch('/:id/receive', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Get transfer, with the source product's details — needed below to
    // resolve (or create) the matching product on the destination side.
    const { data: transfer } = await supabaseAdmin
      .from('stock_transfers')
      .select('*, products(name, description, unit, price)')
      .eq('id', id)
      .single();

    if (!transfer) return error(res, 'Transfer not found', 404);

    if (transfer.status === 'received')
      return error(res, 'Transfer already received', 400);

    // Branch admin can only receive into their own branch
    if (user.role === 'branch_admin' &&
        transfer.to_company_id !== user.company_id)
      return error(res, 'Access denied — this transfer is not for your branch', 403);

    // Products are per-branch rows with their own ids — transfer.product_id
    // points at the SOURCE branch's row, so the destination product has to
    // be resolved by name instead. The destination branch must already
    // carry this product in its own catalog; if it doesn't, that's the
    // receiving admin's call to make (add it under Products first), not
    // something this endpoint decides on its own.
    const sourceInfo = transfer.products;
    const { data: destProduct } = await supabaseAdmin
      .from('products')
      .select('id, stock_quantity')
      .eq('company_id', transfer.to_company_id)
      .ilike('name', sourceInfo?.name || '')
      .maybeSingle();

    if (!destProduct)
      return error(res,
        `"${sourceInfo?.name || 'This product'}" doesn't exist in your branch's catalog yet — add it under Products first, then receive this transfer.`,
        404
      );

    // Add to destination branch stock
    await supabaseAdmin
      .from('products')
      .update({
        stock_quantity: Number(destProduct.stock_quantity) + Number(transfer.quantity)
      })
      .eq('id', destProduct.id);

    // Mark transfer as received
    const { data: updated } = await supabaseAdmin
      .from('stock_transfers')
      .update({
        status:      'received',
        received_by: user.id,
        received_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    return success(res, updated, 'Stock received — inventory updated');
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
