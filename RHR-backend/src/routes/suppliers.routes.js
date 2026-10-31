const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/suppliers.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin, isFieldStaff } = require('../middleware/role.middleware');

// Salesmen and drivers need the list for vendor-transfer recording.
const isAdminOrField = (req, res, next) => {
  if (['super_admin', 'branch_admin', 'salesman', 'driver'].includes(req.user?.role)) return next();
  const { error } = require('../utils/response');
  return error(res, 'Access denied', 403);
};

router.get('/',       authenticate, isAdminOrField, ctrl.getSuppliers);
router.post('/',      authenticate, isAdmin, ctrl.createSupplier);
router.patch('/:id',  authenticate, isAdmin, ctrl.updateSupplier);
router.delete('/:id', authenticate, isAdmin, ctrl.deleteSupplier);

module.exports = router;
