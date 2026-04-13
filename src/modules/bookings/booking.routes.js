const express = require('express');
const router = express.Router();
const bookingController = require('./booking.controller');
const { authenticate } = require('../../middleware/auth');

router.post('/', authenticate, bookingController.create);
router.get('/', authenticate, bookingController.getAll);
router.get('/:id', authenticate, bookingController.getById);
router.get('/user/:userId', authenticate, bookingController.getByUser);
router.put('/:id/cancel', authenticate, bookingController.cancel);
router.post('/:id/transfer', authenticate, bookingController.transfer);

module.exports = router;
