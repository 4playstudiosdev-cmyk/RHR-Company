const { error } = require('../utils/response');

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, 'Not authenticated', 401);
    }
    if (!roles.includes(req.user.role)) {
      return error(res,
        `Access denied — requires: ${roles.join(' or ')}. Your role: ${req.user.role}`,
        403
      );
    }
    next();
  };
};

// Permission check — for branch admin feature control. Inert until a
// `permissions` JSONB column actually exists on the users table and gets
// populated; until then perms is always {} and every permission passes.
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) return error(res, 'Not authenticated', 401);

    // Super admin always has all permissions
    if (req.user.role === 'super_admin') return next();

    const perms = req.user.permissions || {};
    if (perms[permission] === false) {
      return error(res,
        `Access denied — ${permission} is disabled for your account`,
        403
      );
    }
    next();
  };
};

const isSuperAdmin = requireRole('super_admin');
const isAdmin = requireRole('super_admin', 'branch_admin');
const isSalesman = requireRole('salesman');
const isCustomer = requireRole('customer');
const isDriver = requireRole('driver');
const isFieldStaff = requireRole('salesman', 'delivery', 'driver');

module.exports = {
  requireRole,
  requirePermission,
  isSuperAdmin,
  isAdmin,
  isSalesman,
  isCustomer,
  isDriver,
  isFieldStaff
};
