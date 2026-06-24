const express = require('express');
const router = express.Router();
const { getCompaniesHandler } = require('../controllers/companies.controller');

// Public — customers need this during registration (before they have a token)
router.get('/', getCompaniesHandler);

module.exports = router;
