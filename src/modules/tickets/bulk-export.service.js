const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const qrService = require('./qr.service');

const EXPORT_DIR = path.join(process.cwd(), 'uploads', 'exports');
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

/**
 * Generate a bulk PDF of tickets
 * @param {Array} tickets Array of ticket objects with event and attendee info
 * @param {Object} options Customization options (colors, logos)
 */
const generateBulkPDF = async (tickets, options = {}) => {
  const filename = `tickets_${Date.now()}.pdf`;
  const filepath = path.join(EXPORT_DIR, filename);
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const stream = fs.createWriteStream(filepath);

  doc.pipe(stream);

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    if (i > 0) doc.addPage();

    // Design layout
    const themeColor = options.themeColor || '#1a1a2e';
    
    // Header background
    doc.rect(0, 0, 595.28, 150).fill(themeColor);
    
    // Event Title
    doc.fillColor('#ffffff').fontSize(24).text(ticket.event_title, 50, 40, { width: 400 });
    
    // Attendee Name
    doc.fontSize(16).text(ticket.attendee_name, 50, 80);
    
    // Meta info
    doc.fontSize(12).text(`${ticket.venue_name} | ${new Date(ticket.start_date).toLocaleString()}`, 50, 110);
    
    // Content area
    doc.fillColor('#000000').fontSize(14).text('TICKET DETAILS', 50, 180, { underline: true });
    
    doc.fontSize(12).text(`Ticket No: ${ticket.ticket_number}`, 50, 210);
    doc.text(`Category: ${ticket.ticket_type_name || 'General'}`, 50, 230);
    doc.text(`Seat: ${ticket.metadata?.seat || 'GA'}`, 50, 250);
    doc.text(`Gate: ${ticket.metadata?.gate || 'Main Gate'}`, 50, 270);

    // QR Code
    const qrDataUri = await qrService.generateQRDataUri(ticket.qr_token, {
      dark: themeColor,
      width: 150
    });
    
    // Remove data:image/png;base64, prefix for PDFKit (if using data URI)
    // Actually PDFKit can't directly use data URI, we need a buffer
    const qrBuffer = Buffer.from(qrDataUri.split(',')[1], 'base64');
    doc.image(qrBuffer, 400, 180, { width: 140 });

    // Footer
    doc.fontSize(10).fillColor('#666666').text('Please present this ticket at the entry gate. No entry without a valid QR code.', 50, 750, { align: 'center' });
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(`/uploads/exports/${filename}`));
    stream.on('error', reject);
  });
};

module.exports = {
  generateBulkPDF,
};
