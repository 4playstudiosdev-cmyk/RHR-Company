const { pgrestGet } = require('../utils/directQuery');
const { resolveFeatures, defaultsFor, TABLE_BY_ROLE } = require('../utils/appFeatures');
const { error } = require('../utils/response');

// Reads an account's stored feature overrides. Deliberately NOT part of the
// main authenticate() query: if the `permissions` column hasn't been added to
// salesmen/drivers yet (sql/phase69), selecting it there would break every
// login. Here a failed read just means "no overrides" — defaults apply.
async function storedPermissions(role, id) {
  const table = TABLE_BY_ROLE[role];
  if (!table) return {};
  try {
    const rows = await pgrestGet(table, { select: 'permissions', id: `eq.${id}` });
    return rows?.[0]?.permissions || {};
  } catch (e) {
    return {};
  }
}

// The effective features of the logged-in account (admins: not applicable).
async function featuresOf(user) {
  if (!TABLE_BY_ROLE[user.role]) return null;
  return resolveFeatures(user.role, await storedPermissions(user.role, user.id));
}

// requireFeature('new_order')                       — same key for every role it applies to
// requireFeature({ customer: 'place_order', salesman: 'new_order', driver: 'sales_access' })
//                                                   — a key per role; a role not listed
//                                                     (and every admin) passes untouched.
const requireFeature = (spec) => async (req, res, next) => {
  try {
    const role = req.user?.role;
    const key = typeof spec === 'string' ? spec : spec[role];
    if (!key || !TABLE_BY_ROLE[role]) return next();
    const features = await featuresOf(req.user);
    if (features && features[key] === false) {
      return error(res, 'This feature is turned off for your account. Please contact the office.', 403);
    }
    return next();
  } catch (err) {
    console.error('[requireFeature] lookup failed:', err.message);
    // Don't lock someone out of a normally-on feature because the lookup
    // failed — but never grant one that is off by default (e.g. a driver's
    // sales access).
    const role = req.user?.role;
    const key = typeof spec === 'string' ? spec : spec[role];
    if (key && defaultsFor(role)[key] === false) {
      return error(res, 'This feature is turned off for your account. Please contact the office.', 403);
    }
    return next();
  }
};

module.exports = { requireFeature, featuresOf, storedPermissions };
