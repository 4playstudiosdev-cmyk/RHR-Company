const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/reports.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

router.get('/export',           authenticate, isAdmin, ctrl.exportReport);
router.get('/outstanding',      authenticate, isAdmin, ctrl.getOutstanding);
router.get('/purchases',        authenticate, isAdmin, ctrl.getPurchasesReport);
router.get('/expenses',         authenticate, isAdmin, ctrl.getExpensesReport);
router.get('/sale-detail',      authenticate, isAdmin, ctrl.getSaleReport);
router.get('/customer-summary', authenticate, isAdmin, ctrl.getCustomerSummary);
router.get('/customer-ledger/:id', authenticate, isAdmin, ctrl.getCustomerLedger);
router.get('/vendor-summary',   authenticate, isAdmin, ctrl.getVendorSummary);
router.get('/vendor-ledger',    authenticate, isAdmin, ctrl.getVendorLedger);
router.get('/recovery',         authenticate, isAdmin, ctrl.getRecoveryReport);
router.get('/cash-complete',    authenticate, isAdmin, ctrl.getCashReport);

module.exports = router;
