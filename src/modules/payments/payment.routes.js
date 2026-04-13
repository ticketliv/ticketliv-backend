const express = require('express');
const router = express.Router();
const paymentController = require('./payment.controller');
const { authenticate } = require('../../middleware/auth');
const rateLimiter = require('../../middleware/rateLimiter');

router.post('/initiate', authenticate, rateLimiter.payment, paymentController.initiate);
router.post('/verify/:transactionId', authenticate, paymentController.verify);
router.post('/webhook', paymentController.webhook); // No auth - called by payment gateway
router.get('/:id', authenticate, paymentController.getById);
router.post('/refund', authenticate, paymentController.refund);

module.exports = router;
