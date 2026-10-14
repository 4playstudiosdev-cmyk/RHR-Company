const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestPost, pgrestDelete } = require('../utils/directQuery');

// GET /api/v1/promo-banners — every logged-in customer sees the active
// slides for their own branch, plus any branch-less (company_id: null)
// ones meant for everyone.
const getActiveBanners = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const [branchBanners, allBranchBanners] = await Promise.all([
      companyId
        ? pgrestGet('promo_banners', { select: '*', company_id: `eq.${companyId}`, is_active: 'eq.true', order: 'display_order.asc' })
        : Promise.resolve([]),
      pgrestGet('promo_banners', { select: '*', company_id: 'is.null', is_active: 'eq.true', order: 'display_order.asc' }),
    ]);
    const data = [...(branchBanners || []), ...(allBranchBanners || [])];
    return success(res, data);
  } catch (err) { return success(res, []); }
};

// GET /api/v1/promo-banners/admin — every banner (active or not) in this
// admin's scope, for the management screen.
const getAllBanners = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = { select: '*', order: 'display_order.asc' };
    if (companyId) params.company_id = `eq.${companyId}`;
    const data = await pgrestGet('promo_banners', params);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/promo-banners
const createBanner = async (req, res) => {
  try {
    const { media_url, media_type, display_order, company_id } = req.body;
    if (!media_url) return error(res, 'media_url is required', 400);
    if (media_type && !['image', 'video'].includes(media_type))
      return error(res, 'media_type must be image or video', 400);

    const targetCompanyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (company_id || null); // super_admin may leave it null for "every branch"

    const [data] = await pgrestPost('promo_banners', {
      company_id:    targetCompanyId,
      media_url,
      media_type:    media_type || 'image',
      display_order: display_order != null ? Number(display_order) : 0,
      is_active:     true,
      created_by:    req.user.id,
    });
    return success(res, data, 'Banner added', 201);
  } catch (err) { return error(res, err.message); }
};

// DELETE /api/v1/promo-banners/:id
const deleteBanner = async (req, res) => {
  try {
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    await pgrestDelete('promo_banners', filter);
    return success(res, { deleted: true }, 'Banner removed');
  } catch (err) { return error(res, err.message); }
};

module.exports = { getActiveBanners, getAllBanners, createBanner, deleteBanner };
