const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/broadcast.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isSuperAdmin } = require('../middleware/role.middleware');

router.get('/customers', authenticate, isSuperAdmin, ctrl.getBroadcastCustomers);
router.post('/send',     authenticate, isSuperAdmin, ctrl.sendBroadcast);

module.exports = router;
