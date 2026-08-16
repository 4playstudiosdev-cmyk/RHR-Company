const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/payments.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin, isSalesman } = require('../middleware/role.middleware');

router.post('/',            authenticate,          ctrl.createPayment);
router.get('/',             authenticate,          ctrl.getPayments);
router.get('/:id',          authenticate,          ctrl.getPaymentById);
router.patch('/:id/review', authenticate, isAdmin, ctrl.reviewPayment);

module.exports = router;
