const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/bank.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

router.get('/accounts',      authenticate, isAdmin, ctrl.getBankAccounts);
router.post('/accounts',     authenticate, isAdmin, ctrl.createBankAccount);
router.get('/transactions',  authenticate, isAdmin, ctrl.getBankTransactions);

module.exports = router;
