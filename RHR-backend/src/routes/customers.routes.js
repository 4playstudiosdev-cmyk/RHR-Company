const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/customers.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin, isCustomer } = require('../middleware/role.middleware');

router.get('/',              authenticate,             ctrl.getCustomers);
router.get('/pending',       authenticate, isAdmin,     ctrl.getPendingCustomers);
router.patch('/me/location', authenticate, isCustomer,  ctrl.updateMyShopLocation);
router.patch('/:id/rate-tier', authenticate, isAdmin,   ctrl.updateRateTier);
router.get('/:id/pricing',           authenticate, isAdmin, ctrl.getCustomerPricing);
router.put('/:id/pricing/:productId', authenticate, isAdmin, ctrl.setCustomerPricing);
router.delete('/:id/pricing/:productId', authenticate, isAdmin, ctrl.deleteCustomerPricing);
router.get('/:id',           authenticate,             ctrl.getCustomerById);

module.exports = router;
