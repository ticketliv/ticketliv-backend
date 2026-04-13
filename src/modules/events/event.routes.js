const express = require('express');
const router = express.Router();
const eventController = require('./event.controller');
const { authenticate, optionalAuth } = require('../../middleware/auth');

// Public routes
router.get('/', optionalAuth, eventController.getAll);
router.get('/featured', eventController.getFeatured);
router.get('/popular', eventController.getPopular);
router.get('/categorized', eventController.getCategorized);
router.get('/search', eventController.search);
router.get('/:id', optionalAuth, eventController.getById);

// Protected routes
router.post('/', authenticate, eventController.create);
router.put('/:id', authenticate, eventController.update);
router.delete('/:id', authenticate, eventController.remove);
router.patch('/:id/status', authenticate, eventController.updateStatus);

module.exports = router;
