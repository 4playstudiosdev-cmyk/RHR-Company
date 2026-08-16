const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/products.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

router.get('/',            authenticate, ctrl.getProducts);
router.get('/:id',         authenticate, ctrl.getProductById);
router.post('/',           authenticate, isAdmin, ctrl.createProduct);
router.put('/:id',         authenticate, isAdmin, ctrl.updateProduct);
router.patch('/:id/stock', authenticate, isAdmin, ctrl.updateStock);
router.delete('/:id',      authenticate, isAdmin, ctrl.deleteProduct);

module.exports = router;
