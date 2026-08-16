const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/notifications.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

router.post('/send',  authenticate, isAdmin, ctrl.sendNotification);
router.get('/',       authenticate, ctrl.getMyNotifications);

module.exports = router;
