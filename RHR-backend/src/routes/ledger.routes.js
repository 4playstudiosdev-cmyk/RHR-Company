const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/ledger.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

router.post('/adjustment',                 authenticate, isAdmin, ctrl.adjustLedger);
router.get('/:customerId',                 authenticate, ctrl.getLedger);
router.get('/:customerId/statement',       authenticate, ctrl.downloadStatement);
router.get('/:customerId/statement/excel', authenticate, ctrl.downloadStatementExcel);

module.exports = router;
