const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/orders.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin, isDriver, isCustomer, requireRole } = require('../middleware/role.middleware');
const { requireFeature } = require('../middleware/feature.middleware');

router.post('/',            authenticate, requireFeature({ customer: 'place_order', salesman: 'new_order', driver: 'sales_access' }), ctrl.createOrder);
router.get('/',             authenticate,          ctrl.getOrders);
router.get('/deleted-invoices', authenticate, isAdmin, ctrl.getDeletedInvoices);
router.get('/:id',          authenticate,          ctrl.getOrderById);
router.patch('/:id/status', authenticate, isAdmin, ctrl.updateOrderStatus);
router.patch('/:id/priority', authenticate, requireRole('super_admin', 'branch_admin', 'salesman'), ctrl.setOrderPriority);
router.patch('/:id/driver-status', authenticate, isDriver, ctrl.driverUpdateOrderStatus);
router.patch('/:id/items',  authenticate, isAdmin, ctrl.updateOrderItems);
router.patch('/:id/customer-items', authenticate, isCustomer, ctrl.customerUpdateOrderItems);
router.patch('/:id/mark-invoiced', authenticate, isAdmin, ctrl.markInvoiceGenerated);
router.delete('/:id/invoice', authenticate, isAdmin, ctrl.deleteInvoice);

module.exports = router;
