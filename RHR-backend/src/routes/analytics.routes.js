const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/salesman/:id', authenticate, ctrl.getSalesmanAnalytics);
router.get('/dashboard',    authenticate, ctrl.getDashboardStats);

module.exports = router;
