const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/promoBanners.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/role.middleware');

router.get('/',        authenticate,          ctrl.getActiveBanners);
router.get('/admin',   authenticate, isAdmin, ctrl.getAllBanners);
router.post('/',       authenticate, isAdmin, ctrl.createBanner);
router.delete('/:id',  authenticate, isAdmin, ctrl.deleteBanner);

module.exports = router;
