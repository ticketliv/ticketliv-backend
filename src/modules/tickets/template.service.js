const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const qrService = require('./qr.service');

const ASSETS_DIR = path.join(process.cwd(), 'uploads', 'tickets');
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

/**
 * High-Fidelity Template Service
 * Generates premium ticket assets in various layouts and formats
 */
class TemplateService {
  /**
   * Layout Definitions
   */
  static LAYOUTS = {
    PORTRAIT: { width: 800, height: 1200, qrSize: 250, qrPos: { x: 275, y: 850 } },
    LANDSCAPE: { width: 1200, height: 600, qrSize: 200, qrPos: { x: 950, y: 200 } },
    WRISTBAND: { width: 1800, height: 150, qrSize: 120, qrPos: { x: 1650, y: 15 } }
  };

  /**
   * Generate a ticket as a PNG image
   */
  static async generateImage(ticketData, layoutType = 'PORTRAIT') {
    const layout = this.LAYOUTS[layoutType] || this.LAYOUTS.PORTRAIT;
    const themeColor = ticketData.themeColor || '#1a1a2e';
    
    // Create base background with theme color and subtle gradient/pattern
    // (In a real app, this would be a pre-designed PNG/SVG)
    const svgBackground = `
      <svg width="${layout.width}" height="${layout.height}">
        <rect width="100%" height="100%" fill="${themeColor}"/>
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:rgba(255,255,255,0.1);stop-opacity:1" />
            <stop offset="100%" style="stop-color:rgba(0,0,0,0.2);stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)"/>
        ${layoutType === 'PORTRAIT' ? `
          <text x="50" y="80" font-family="Arial" font-size="60" font-weight="bold" fill="white">${ticketData.eventTitle}</text>
          <text x="50" y="160" font-family="Arial" font-size="30" fill="rgba(255,255,255,0.8)">${ticketData.date} | ${ticketData.venue}</text>
          <text x="50" y="300" font-family="Arial" font-size="40" font-weight="bold" fill="white">ADMIT ONE</text>
          <text x="50" y="360" font-family="Arial" font-size="50" fill="white">${ticketData.attendeeName}</text>
        ` : ''}
        ${layoutType === 'LANDSCAPE' ? `
          <text x="50" y="80" font-family="Arial" font-size="50" font-weight="bold" fill="white">${ticketData.eventTitle}</text>
          <text x="50" y="140" font-family="Arial" font-size="24" fill="rgba(255,255,255,0.8)">${ticketData.date} | ${ticketData.venue}</text>
          <text x="50" y="300" font-family="Arial" font-size="36" font-weight="bold" fill="white">${ticketData.attendeeName}</text>
        ` : ''}
      </svg>
    `;

    // Generate QR
    const qrImageBuffer = await qrService.generateQRBuffer(ticketData.qr_token, {
      dark: themeColor,
      width: layout.qrSize,
      margin: 1
    });

    const filename = `ticket_${ticketData.tid}_${layoutType.toLowerCase()}.png`;
    const filepath = path.join(ASSETS_DIR, filename);

    await sharp(Buffer.from(svgBackground))
      .composite([{ input: qrImageBuffer, left: layout.qrPos.x, top: layout.qrPos.y }])
      .png()
      .toFile(filepath);

    return `/uploads/tickets/${filename}`;
  }

  /**
   * Generate a high-quality PDF ticket
   */
  static async generatePDF(ticketData, layoutType = 'PORTRAIT') {
    const layout = this.LAYOUTS[layoutType] || this.LAYOUTS.PORTRAIT;
    const filename = `ticket_${ticketData.tid}.pdf`;
    const filepath = path.join(ASSETS_DIR, filename);
    
    const doc = new PDFDocument({ 
      size: [layout.width, layout.height], 
      margin: 0 
    });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // Background
    doc.rect(0, 0, layout.width, layout.height).fill(ticketData.themeColor || '#1a1a2e');

    // Content
    doc.fillColor('#ffffff').fontSize(60).text(ticketData.eventTitle, 50, 50);
    doc.fontSize(30).text(`${ticketData.date} | ${ticketData.venue}`, 50, 130);
    
    doc.fontSize(40).text('ADMIT ONE', 50, 250);
    doc.fontSize(50).text(ticketData.attendeeName, 50, 310);

    // QR Code
    const qrDataUri = await qrService.generateQRDataUri(ticketData.qr_token, {
      dark: ticketData.themeColor || '#1a1a2e',
      width: layout.qrSize
    });
    const qrBuffer = Buffer.from(qrDataUri.split(',')[1], 'base64');
    doc.image(qrBuffer, layout.qrPos.x, layout.qrPos.y, { width: layout.qrSize });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(`/uploads/tickets/${filename}`));
      stream.on('error', reject);
    });
  }
}

module.exports = TemplateService;
