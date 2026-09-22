const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/suppliers.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

router.get('/',      authenticate, isAdmin, ctrl.getSuppliers);
router.post('/',     authenticate, isAdmin, ctrl.createSupplier);
router.delete('/:id', authenticate, isAdmin, ctrl.deleteSupplier);

module.exports = router;
