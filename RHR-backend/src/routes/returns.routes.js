const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/returns.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

router.get('/materials',  authenticate, isAdmin, ctrl.getMaterialReturns);
router.post('/materials', authenticate, isAdmin, ctrl.createMaterialReturn);
router.get('/orders',     authenticate, isAdmin, ctrl.getOrderReturns);
router.post('/orders',    authenticate, isAdmin, ctrl.createOrderReturn);

module.exports = router;
