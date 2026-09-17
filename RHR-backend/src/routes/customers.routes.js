const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/customers.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin, isCustomer } = require('../middleware/role.middleware');

router.get('/',              authenticate,             ctrl.getCustomers);
router.post('/',              authenticate, isAdmin,    ctrl.createCustomer);
router.get('/pending',       authenticate, isAdmin,     ctrl.getPendingCustomers);
router.patch('/me/location', authenticate, isCustomer,  ctrl.updateMyShopLocation);
router.patch('/:id/rate-tier', authenticate, isAdmin,   ctrl.updateRateTier);
router.patch('/:id/assign-salesman', authenticate, isAdmin, ctrl.assignSalesman);
router.patch('/:id/assign-driver',   authenticate, isAdmin, ctrl.assignDriver);
router.patch('/:id',          authenticate, isAdmin,    ctrl.updateCustomer);
router.delete('/:id',         authenticate, isAdmin,    ctrl.deleteCustomer);
router.get('/:id/pricing',           authenticate, isAdmin, ctrl.getCustomerPricing);
router.put('/:id/pricing/:productId', authenticate, isAdmin, ctrl.setCustomerPricing);
router.delete('/:id/pricing/:productId', authenticate, isAdmin, ctrl.deleteCustomerPricing);
router.get('/:id',           authenticate,             ctrl.getCustomerById);

module.exports = router;
