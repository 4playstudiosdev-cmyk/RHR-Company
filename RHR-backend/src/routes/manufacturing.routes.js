const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/manufacturing.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/role.middleware');

router.get('/heads',    authenticate, isAdmin, ctrl.getHeads);
router.post('/heads',   authenticate, isAdmin, ctrl.createHead);
router.patch('/heads/:id', authenticate, isAdmin, ctrl.updateHead);
router.delete('/heads/:id', authenticate, isAdmin, ctrl.deleteHead);

router.get('/workers',    authenticate, isAdmin, ctrl.getWorkers);
router.post('/workers',   authenticate, isAdmin, ctrl.createWorker);
router.patch('/workers/:id', authenticate, isAdmin, ctrl.updateWorker);
router.delete('/workers/:id', authenticate, isAdmin, ctrl.deleteWorker);

router.get('/attendance',  authenticate, isAdmin, ctrl.getAttendance);
router.post('/attendance', authenticate, isAdmin, ctrl.saveAttendance);

router.post('/payout',  authenticate, isAdmin, ctrl.calculatePayout);
router.get('/earnings', authenticate, isAdmin, ctrl.getEarnings);

module.exports = router;
