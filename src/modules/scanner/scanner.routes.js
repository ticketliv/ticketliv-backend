const express = require('express');
const router = express.Router();
const scannerController = require('./scanner.controller');
const { authenticate } = require('../../middleware/auth');

router.post('/validate', authenticate, scannerController.validateTicket);
router.post('/batch', authenticate, scannerController.batchValidate);
router.get('/stats/:eventId?', authenticate, scannerController.getStats);
router.get('/event/:eventId/manifest', authenticate, scannerController.getOfflineManifest);
router.post('/sync', authenticate, scannerController.syncOfflineScans);
router.get('/logs/:eventId', authenticate, scannerController.getScanLogs);

module.exports = router;
