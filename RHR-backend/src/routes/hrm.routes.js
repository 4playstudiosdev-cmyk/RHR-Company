const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/hrm.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');

// Attendance
router.post('/attendance/checkin',    authenticate, ctrl.checkIn);
router.post('/attendance/checkout',   authenticate, ctrl.checkOut);
router.get('/attendance/:userId',     authenticate, ctrl.getAttendance);
router.post('/attendance/manual',     authenticate, isAdmin, ctrl.manualAttendance);

// Salary
router.post('/salary/setup',          authenticate, isAdmin, ctrl.setupSalary);
router.get('/payroll',                authenticate, isAdmin, ctrl.getPayroll);
router.get('/salary/:userId',         authenticate, ctrl.getSalary);
router.get('/payslip/:userId',        authenticate, ctrl.downloadPayslip);

// Leave
router.post('/leave/apply',           authenticate, ctrl.applyLeave);
router.post('/leave/manual',          authenticate, isAdmin, ctrl.manualLeaveRequest);
router.patch('/leave/:id/review',     authenticate, isAdmin, ctrl.reviewLeave);
router.get('/leave',                  authenticate, isAdmin, ctrl.getAllLeaveRequests);
router.get('/leave/:userId',          authenticate, ctrl.getLeaveHistory);

module.exports = router;
