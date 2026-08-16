const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/admin-location.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

router.post('/ping',              authenticate, isAdmin, ctrl.pingAdminLocation);
router.get('/live',               authenticate, isAdmin, ctrl.getAdminLiveLocations);
router.get('/history/:adminId',   authenticate, isAdmin, ctrl.getAdminLocationHistory);

module.exports = router;
