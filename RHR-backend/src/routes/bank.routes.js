const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/bank.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin, requireRole } = require('../middleware/role.middleware');

router.get('/accounts',      authenticate, isAdmin, ctrl.getBankAccounts);
router.post('/accounts',     authenticate, isAdmin, ctrl.createBankAccount);
router.get('/transactions',  authenticate, isAdmin, ctrl.getBankTransactions);
// A salesman/driver needs the account list to pick one on Record
// Payment's / Cash Collection's Bank Transfer flow — same controller/
// fields as the admin route above (no balance exposed, just
// name/number/bank/branch), just a wider role gate.
router.get('/accounts/list', authenticate, requireRole('super_admin', 'branch_admin', 'salesman', 'driver'), ctrl.getBankAccounts);

module.exports = router;
