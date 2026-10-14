const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { pgrestGet, pgrestPost } = require('../utils/directQuery');
const { success, error } = require('../utils/response');

// POST /api/v1/visits — salesman logs a visit. notes is mandatory — a
// visit can't be marked done without saying what happened (the Flutter
// "Visit Done" bottom sheet enforces this too, but the backend doesn't
// trust the client alone). visited_at defaults to now but the frontend
// may send its own (date picker, defaults to today, editable).
router.post('/', authenticate, async (req, res) => {
  try {
    const { customer_id, notes, latitude, longitude, follow_up_date, visited_at } = req.body;
    if (!customer_id) return error(res, 'customer_id is required', 400);
    if (!notes || !notes.trim()) return error(res, 'notes are required to log a visit', 400);

    const [data] = await pgrestPost('customer_visits', {
      company_id:     req.user.company_id,
      salesman_id:    req.user.id,
      customer_id,
      notes:          notes.trim(),
      latitude:       latitude || null,
      longitude:      longitude || null,
      follow_up_date: follow_up_date || null,
      visited_at:     visited_at || new Date().toISOString(),
    });

    return success(res, data, 'Visit logged', 201);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/visits — salesman sees own visits, admin sees all
router.get('/', authenticate, async (req, res) => {
  try {
    const params = {
      select: '*, users!customer_id(full_name, phone)',
      company_id: `eq.${req.user.company_id}`,
      order: 'visited_at.desc',
    };
    if (req.user.role === 'salesman') params.salesman_id = `eq.${req.user.id}`;

    const data = await pgrestGet('customer_visits', params);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
