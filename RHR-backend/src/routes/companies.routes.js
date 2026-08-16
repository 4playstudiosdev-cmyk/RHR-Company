const express = require('express');
const router  = express.Router();
const { getCompanies } = require('../controllers/companies.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Public — used in register screen branch dropdown
router.get('/', getCompanies);

module.exports = router;
