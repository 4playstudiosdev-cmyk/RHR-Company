const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

const production = require('../controllers/production.controller');
const materials   = require('../controllers/rawMaterials.controller');
const dispatch    = require('../controllers/dispatch.controller');
const reports      = require('../controllers/productionReports.controller');

router.get('/demand',              authenticate, isAdmin, production.getProductionDemand);
router.get('/orders',              authenticate, isAdmin, production.getProductionOrders);
router.post('/orders',             authenticate, isAdmin, production.createProductionOrder);
router.patch('/orders/:id/status', authenticate, isAdmin, production.updateProductionOrderStatus);

router.get('/materials',           authenticate, isAdmin, materials.getMaterials);
router.post('/materials',          authenticate, isAdmin, materials.createMaterial);
router.patch('/materials/:id/stock', authenticate, isAdmin, materials.addStock);

router.get('/dispatch',            authenticate, isAdmin, dispatch.getDispatches);
router.post('/dispatch',           authenticate, isAdmin, dispatch.createDispatch);
router.patch('/dispatch/:id/deliver', authenticate, isAdmin, dispatch.markDelivered);

router.get('/reports/daily',       authenticate, isAdmin, reports.getDailyReport);
router.get('/reports/consumption', authenticate, isAdmin, reports.getConsumptionReport);
router.get('/reports/stock',       authenticate, isAdmin, reports.getStockReport);

module.exports = router;
