const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/categories.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

router.get('/',  authenticate, ctrl.getCategories);
router.post('/', authenticate, isAdmin, ctrl.createCategory);

module.exports = router;
