const express      = require('express');
const router       = express.Router();
const ctrl         = require('../controllers/storage.controller');
const { authenticate }  = require('../middleware/auth.middleware');
const { isAdmin }       = require('../middleware/role.middleware');

// Upload file — any authenticated user
router.post('/upload',     authenticate, ctrl.uploadFile);

// Get signed URL for private file — any authenticated user
router.get('/signed-url',  authenticate, ctrl.getSignedUrl);

// List files in bucket — admin only
router.get('/files',       authenticate, isAdmin, ctrl.listFiles);

// Delete a file — admin only
router.delete('/file',     authenticate, isAdmin, ctrl.deleteFile);

module.exports = router;
