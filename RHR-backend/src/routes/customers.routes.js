const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/customers.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin, isCustomer, isSuperAdmin, requireRole } = require('../middleware/role.middleware');

router.get('/',              authenticate,             ctrl.getCustomers);
// A salesman registering a new customer on the spot uses this same
// endpoint — createCustomer forces their own company_id/salesman_id
// when the caller is a salesman, so they can't assign a customer to
// another branch or another salesman.
router.post('/',              authenticate, requireRole('super_admin', 'branch_admin', 'salesman'), ctrl.createCustomer);
router.get('/pending',       authenticate, isAdmin,     ctrl.getPendingCustomers);
router.patch('/me/location', authenticate, isCustomer,  ctrl.updateMyShopLocation);
router.get('/me/profile',    authenticate, isCustomer,  ctrl.getMyProfile);
router.get('/me/salesman',   authenticate, isCustomer,  ctrl.getMySalesman);
router.patch('/me/profile',  authenticate, isCustomer,  ctrl.updateMyProfile);
router.patch('/:id/rate-tier', authenticate, isAdmin,   ctrl.updateRateTier);
router.patch('/:id/credit-limit', authenticate, isAdmin, ctrl.updateCreditLimit);
router.patch('/:id/assign-salesman', authenticate, isAdmin, ctrl.assignSalesman);
router.patch('/:id/assign-driver',   authenticate, isAdmin, ctrl.assignDriver);
router.patch('/:id',          authenticate, isAdmin,    ctrl.updateCustomer);
router.delete('/:id',         authenticate, isAdmin,    ctrl.deleteCustomer);
router.get('/:id/profile-pdf',       authenticate, isSuperAdmin, ctrl.downloadCustomerProfilePDF);
// Widened to also let a salesman set/read pricing — needed so the
// mobile Add Customer wizard's pricing step can apply custom prices
// to a customer the salesman is registering themselves. findScopedCustomer
// restricts a salesman caller to customers assigned to them.
router.get('/:id/pricing',           authenticate, requireRole('super_admin', 'branch_admin', 'salesman'), ctrl.getCustomerPricing);
router.put('/:id/pricing/:productId', authenticate, requireRole('super_admin', 'branch_admin', 'salesman'), ctrl.setCustomerPricing);
router.delete('/:id/pricing/:productId', authenticate, requireRole('super_admin', 'branch_admin', 'salesman'), ctrl.deleteCustomerPricing);
router.get('/:id',           authenticate,             ctrl.getCustomerById);

module.exports = router;
