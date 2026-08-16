const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/orders.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

router.post('/',            authenticate,          ctrl.createOrder);
router.get('/',             authenticate,          ctrl.getOrders);
router.get('/:id',          authenticate,          ctrl.getOrderById);
router.patch('/:id/status', authenticate, isAdmin, ctrl.updateOrderStatus);

module.exports = router;
