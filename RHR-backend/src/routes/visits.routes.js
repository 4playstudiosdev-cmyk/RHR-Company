const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// POST /api/v1/visits — salesman logs a visit
router.post('/', authenticate, async (req, res) => {
  try {
    const { customer_id, notes, latitude, longitude, follow_up_date } = req.body;
    if (!customer_id) return error(res, 'customer_id is required', 400);

    const { data, error: dbErr } = await supabaseAdmin
      .from('customer_visits')
      .insert({
        company_id:     req.user.company_id,
        salesman_id:    req.user.id,
        customer_id,
        notes:          notes || null,
        latitude:       latitude || null,
        longitude:      longitude || null,
        follow_up_date: follow_up_date || null,
        visited_at:     new Date().toISOString()
      })
      .select().single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Visit logged', 201);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/visits — salesman sees own visits, admin sees all
router.get('/', authenticate, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('customer_visits')
      .select('*, users!customer_id(full_name, phone)')
      .eq('company_id', req.user.company_id)
      .order('visited_at', { ascending: false });

    if (req.user.role === 'salesman')
      query = query.eq('salesman_id', req.user.id);

    const { data, error: dbErr } = await query;
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
