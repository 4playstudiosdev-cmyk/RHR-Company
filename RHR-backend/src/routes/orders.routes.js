const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/orders.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

router.post('/',            authenticate,          ctrl.createOrder);
router.get('/',             authenticate,          ctrl.getOrders);
router.get('/:id',          authenticate,          ctrl.getOrderById);
router.patch('/:id/status', authenticate, isAdmin, ctrl.updateOrderStatus);
router.patch('/:id/items',  authenticate, isAdmin, ctrl.updateOrderItems);
router.patch('/:id/mark-invoiced', authenticate, isAdmin, ctrl.markInvoiceGenerated);

module.exports = router;
