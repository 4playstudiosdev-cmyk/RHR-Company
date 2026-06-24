const { error } = require('../utils/response');
 
// Usage: router.get('/route', authenticate, requireRole('super_admin'), controller)
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return error(res, 'Access denied. Insufficient permissions.', 403);
    }
    next();
  };
};
 
// Shortcut guards
const isSuperAdmin = requireRole('super_admin');
const isAdmin = requireRole('super_admin', 'branch_admin');
const isSalesman = requireRole('salesman');
const isCustomer = requireRole('customer');
const isFieldStaff = requireRole('salesman', 'delivery');
 
module.exports = { requireRole, isSuperAdmin, isAdmin, isSalesman, isCustomer, isFieldStaff };