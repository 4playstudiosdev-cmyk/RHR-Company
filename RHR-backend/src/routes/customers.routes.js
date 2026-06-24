const express = require('express');
const router = express.Router();
const { getPendingCustomersHandler } = require('../controllers/customers.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/role.middleware');

router.get('/pending', authenticate, isAdmin, getPendingCustomersHandler);

module.exports = router;
