const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { success, error } = require('../utils/response');
const { searchAddress } = require('../utils/geocoding');

// GET /api/v1/geocode/search?q=... — the shop-location picker's search
// bar (lets a user type an address instead of only dragging the pin).
// Proxied through our own backend rather than called directly from the
// app so Nominatim only ever sees one server IP, not one per device.
router.get('/search', authenticate, async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || String(q).trim().length < 3)
      return error(res, 'q must be at least 3 characters', 400);

    const results = await searchAddress(String(q).trim());
    return success(res, results);
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
