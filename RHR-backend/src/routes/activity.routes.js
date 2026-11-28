// GET /api/v1/activity?customer_id=&order_id=&action=&limit= — the order tracker
// (activity_log, sql/phase83). Admins only; a branch admin sees their own branch.
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/role.middleware');
const { pgrestGet } = require('../utils/directQuery');
const { success, error } = require('../utils/response');

router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { customer_id, order_id, action } = req.query;
    if (!customer_id && !order_id) return error(res, 'customer_id or order_id is required', 400);
    const params = { select: '*', order: 'created_at.desc', limit: String(Math.min(Number(req.query.limit) || 200, 500)) };
    if (order_id) params.order_id = `eq.${order_id}`;
    else params.customer_id = `eq.${customer_id}`;
    if (action) params.action = `eq.${action}`;
    if (req.user.role !== 'super_admin') params.company_id = `eq.${req.user.company_id}`;
    let rows;
    try {
      rows = await pgrestGet('activity_log', params);
    } catch (e) {
      if (/activity_log/.test(e.message || '')) return success(res, [], 'Activity log not set up yet (run sql/phase83_activity_log.sql)');
      throw e;
    }
    return success(res, rows || []);
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
