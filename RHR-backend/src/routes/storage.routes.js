const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/storage.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/upload', authenticate, ctrl.uploadFile);

module.exports = router;
