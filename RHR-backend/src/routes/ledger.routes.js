const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/ledger.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/:customerId', authenticate, ctrl.getLedger);

module.exports = router;
