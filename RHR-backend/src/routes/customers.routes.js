const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/customers.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin, isCustomer } = require('../middleware/role.middleware');

router.get('/',              authenticate,             ctrl.getCustomers);
router.get('/pending',       authenticate, isAdmin,     ctrl.getPendingCustomers);
router.patch('/me/location', authenticate, isCustomer,  ctrl.updateMyShopLocation);
router.get('/:id',           authenticate,             ctrl.getCustomerById);

module.exports = router;
