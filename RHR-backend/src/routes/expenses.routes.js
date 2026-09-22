const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/expenses.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

router.get('/',     authenticate, isAdmin, ctrl.getExpenses);
router.post('/',    authenticate, isAdmin, ctrl.createExpense);
router.delete('/:id', authenticate, isAdmin, ctrl.deleteExpense);

module.exports = router;
