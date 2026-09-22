const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');

// GET /api/v1/suppliers?company_id= — active suppliers for the autocomplete
// on Raw Materials → Purchase, and for the standalone Suppliers panel.
const SELECT_FIELDS = 'id,company_id,name,address,contact_number,categories,is_active,created_at';

const getSuppliers = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: SELECT_FIELDS,
      is_active: 'eq.true',
      order: 'name.asc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;

    let data;
    try {
      data = await pgrestGet('suppliers', params);
    } catch (e) {
      // address/contact_number/categories are a later addition on top of
      // the original phase21 table — fall back to the plain columns if
      // that part hasn't run yet.
      data = await pgrestGet('suppliers', { ...params, select: 'id,company_id,name,is_active,created_at' });
    }
    return success(res, data);
  } catch (err) {
    // suppliers is a phase21 addition — read as empty rather than
    // breaking the purchase modal/Suppliers panel before it's run.
    return success(res, []);
  }
};

// POST /api/v1/suppliers — manual add (the Suppliers panel's own "Add"
// button). Case-insensitive unique per branch (see phase21's index) —
// re-adding an existing name just returns the existing row instead of
// erroring, since from the admin's point of view that's not a failure.
const createSupplier = async (req, res) => {
  try {
    const { name, company_id, address, contact_number, categories } = req.body;
    if (!name || !name.trim()) return error(res, 'name is required', 400);

    const targetCompanyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (company_id || req.user.company_id);

    const existing = await pgrestGet('suppliers', {
      select: 'id,company_id,name,is_active',
      company_id: `eq.${targetCompanyId}`,
      name: `ilike.${name.trim()}`,
    });
    if (existing?.[0]) {
      if (!existing[0].is_active) {
        const reactivated = await pgrestPatch('suppliers', { id: `eq.${existing[0].id}` }, { is_active: true });
        return success(res, reactivated?.[0], 'Supplier reactivated', 201);
      }
      return success(res, existing[0], 'Supplier already exists');
    }

    const baseRow = { company_id: targetCompanyId, name: name.trim(), is_active: true };
    let data;
    try {
      [data] = await pgrestPost('suppliers', {
        ...baseRow,
        address: address || null,
        contact_number: contact_number || null,
        categories: Array.isArray(categories) ? categories : [],
      });
    } catch (e) {
      [data] = await pgrestPost('suppliers', baseRow);
    }
    return success(res, data, 'Supplier added', 201);
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/suppliers/:id — edit name/address/contact_number/categories.
const updateSupplier = async (req, res) => {
  try {
    const { name, address, contact_number, categories } = req.body;
    if (name !== undefined && !name.trim()) return error(res, 'name cannot be empty', 400);

    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;

    const body = {};
    if (name !== undefined) body.name = name.trim();
    if (address !== undefined) body.address = address || null;
    if (contact_number !== undefined) body.contact_number = contact_number || null;
    if (categories !== undefined) body.categories = Array.isArray(categories) ? categories : [];

    const data = await pgrestPatch('suppliers', filter, body);
    if (!data?.[0]) return error(res, 'Supplier not found', 404);
    return success(res, data[0], 'Supplier updated');
  } catch (err) { return error(res, err.message); }
};

// DELETE /api/v1/suppliers/:id — soft delete, same convention as
// salesmen/drivers/customers.
const deleteSupplier = async (req, res) => {
  try {
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    const data = await pgrestPatch('suppliers', filter, { is_active: false });
    if (!data?.[0]) return error(res, 'Supplier not found', 404);
    return success(res, { deleted: true }, 'Supplier removed');
  } catch (err) { return error(res, err.message); }
};

// Shared by the purchase endpoint — finds a supplier by name (case
// insensitive) for this company, creating it if it doesn't exist yet, so
// a freely-typed new supplier name lands in the list automatically.
async function findOrCreateSupplier(companyId, name) {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();

  const existing = await pgrestGet('suppliers', {
    select: 'id,name',
    company_id: `eq.${companyId}`,
    name: `ilike.${trimmed}`,
  });
  if (existing?.[0]) return existing[0];

  const [created] = await pgrestPost('suppliers', {
    company_id: companyId,
    name: trimmed,
    is_active: true,
  });
  return created;
}

module.exports = { getSuppliers, createSupplier, updateSupplier, deleteSupplier, findOrCreateSupplier };
