const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/reports.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

router.get('/export',      authenticate, isAdmin, ctrl.exportReport);
router.get('/outstanding', authenticate, isAdmin, ctrl.getOutstanding);

module.exports = router;
