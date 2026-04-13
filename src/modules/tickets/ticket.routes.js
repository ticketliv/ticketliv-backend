const express = require('express');
const router = express.Router();
const ticketController = require('./ticket.controller');
const templateController = require('./ticket-template.controller');
const { authenticate } = require('../../middleware/auth');

// Templates
router.get('/templates', authenticate, templateController.getAll);
router.post('/templates', authenticate, templateController.create);
router.get('/templates/:id', authenticate, templateController.getById);
router.put('/templates/:id', authenticate, templateController.update);
router.delete('/templates/:id', authenticate, templateController.remove);

// Tickets
router.get('/event/:eventId', ticketController.getEventTickets);
router.post('/reserve', authenticate, ticketController.reserve);
router.post('/release', authenticate, ticketController.release);
router.get('/:id/qr', authenticate, ticketController.getQR);
router.post('/generate', authenticate, ticketController.generateTickets);
router.get('/booking/:bookingId', authenticate, ticketController.getByBooking);
router.get('/export/png/:id', authenticate, ticketController.exportTicketPNG); // Added this line

// Advanced Management
router.post('/bulk-generate', authenticate, ticketController.generateBulkTickets);
router.get('/export/pdf/:eventId', authenticate, ticketController.exportTicketsPDF);

module.exports = router;
