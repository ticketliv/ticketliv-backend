const templateService = require('../src/modules/tickets/template.service');
const fs = require('fs');
const path = require('path');

async function testTemplating() {
  console.log('--- Testing High-Fidelity Templating ---');

  const ticketData = {
    tid: 'TKT-789-VIBE',
    qr_token: 'https://verify.ticketliv.com/scan?token=MOCK_TOKEN',
    eventTitle: 'Neon Nights Festival',
    attendeeName: 'Jane Smith',
    date: 'Dec 31, 2026',
    venue: 'Cyber Dome Arena',
    themeColor: '#4f46e5'
  };

  try {
    const portraitPath = await templateService.generateImage(ticketData, 'PORTRAIT');
    console.log('✅ Portrait PNG generated:', portraitPath);

    const landscapePath = await templateService.generateImage(ticketData, 'LANDSCAPE');
    console.log('✅ Landscape PNG generated:', landscapePath);

    const wristbandPath = await templateService.generateImage(ticketData, 'WRISTBAND');
    console.log('✅ Wristband PNG generated:', wristbandPath);

  } catch (err) {
    console.error('❌ Templating failed:', err);
  }

  console.log('--- Templating Test Complete ---');
}

testTemplating().catch(console.error);
