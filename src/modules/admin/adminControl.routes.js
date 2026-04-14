const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth');
const adminControl = require('./adminControl.controller');

// Secure all admin routes
router.use(authenticate);

// We allow Super Admin, Admin, and Manager specifically to manage this section
router.use(authorize('Super Admin', 'Superadmin', 'Admin', 'Manager'));

// --- Event Publishing Workflow ---
router.get('/events/pending', adminControl.getPendingEvents);
router.post('/events/:id/approve', adminControl.approveEvent);
router.post('/events/:id/reject', adminControl.rejectEvent);

// --- User Management ---
router.get('/users', adminControl.getAllUsers);
router.post('/users', adminControl.createUser);
router.put('/users/:id', adminControl.updateUser);
router.delete('/users/:id', adminControl.deleteUser);

// --- Scanner Management ---
router.get('/scanners', adminControl.getScanners);
router.post('/scanners/assign', adminControl.assignScannerToEvent);
router.delete('/scanners/assign/:id', adminControl.removeScannerAssignment);

// --- Dashboard & Analytics ---
router.get('/dashboard/stats', adminControl.getDashboardStats);
router.get('/transactions', adminControl.getTransactions);

// --- Audit & Logs ---
router.get('/audit', adminControl.getAuditLogs);
router.get('/attendees', adminControl.getAttendees);

module.exports = router;
