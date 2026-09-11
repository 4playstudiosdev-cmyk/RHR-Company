// Shared "which branch's data should this request see" resolver for the
// CityFilter dropdown (src/components/CityFilter.js on the frontend).
// super_admin can pass ?company_id=<uuid> to narrow to one branch, or
// omit it (dropdown's "All Cities") to see every branch at once — this
// returns null in that case, and callers should skip the .eq('company_id',
// ...) filter entirely when they get null back. Everyone else
// (branch_admin, salesman, customer) is always locked to their own
// company_id regardless of any query param.
function resolveCompanyId(req) {
  if (req.user.role === 'super_admin') return req.query.company_id || null;
  return req.user.company_id;
}

module.exports = { resolveCompanyId };
