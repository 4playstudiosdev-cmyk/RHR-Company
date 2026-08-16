const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/gps.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin, isCustomer } = require('../middleware/role.middleware');

router.post('/ping',              authenticate, ctrl.pingLocation);
router.post('/batch-ping',        authenticate, ctrl.batchPingLocation);
router.get('/live',               authenticate, isAdmin, ctrl.getLiveLocations);
router.get('/my-salesman',        authenticate, isCustomer, ctrl.getMySalesmanLocation);
router.get('/route/:userId',      authenticate, ctrl.getRoute);
router.get('/history/:userId',    authenticate, ctrl.getLocationHistory);

module.exports = router;
