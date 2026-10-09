const https       = require('https');
const PDFDocument  = require('pdfkit');
const path         = require('path');

const LOGO_PATH = path.join(__dirname, '../../assets/rhr-logo.jpeg');

// Both profile_photo_url and nic_image_url are plain https URLs (public
// Supabase Storage URL or a signed URL) — pdfkit's doc.image() needs an
// actual buffer/path, not a URL, so this downloads the bytes first.
// Best-effort: a dead/missing image just renders as a placeholder box
// below rather than failing the whole PDF.
function fetchImageBuffer(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', () => resolve(null));
  });
}

async function buildCustomerProfilePDF(customer, company) {
  const [profileBuf, nicBuf] = await Promise.all([
    fetchImageBuffer(customer.profile_photo_url),
    fetchImageBuffer(customer.nic_image_url),
  ]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    const chunks = [];
    doc.on('data',  (c) => chunks.push(c));
    doc.on('end',   ()  => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W         = 595;
    const M         = 45;
    const DARK_BLUE = '#1B2E6B';
    const ORANGE    = '#E8841A';
    const GRAY      = '#888888';
    const BLACK     = '#1A1A1A';
    const WHITE     = '#FFFFFF';
    const BORDER    = '#CCCCCC';

    // ── HEADER ──
    doc.rect(0, 0, W, 90).fill(DARK_BLUE);
    try { doc.image(LOGO_PATH, M, 15, { width: 60, height: 60 }); } catch (e) {}
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(20).text('RHR & COMPANY', M + 72, 24);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(9).text('THE SIGN OF QUALITY', M + 72, 48);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(20).text('CUSTOMER INFORMATION', 250, 34, { width: 300, align: 'right' });

    let y = 112;

    // ── PROFILE PHOTO + HEADLINE ──
    if (profileBuf) {
      try { doc.image(profileBuf, M, y, { fit: [90, 90], align: 'center', valign: 'center' }); } catch (e) {}
    } else {
      doc.rect(M, y, 90, 90).fillAndStroke('#EEEEEE', BORDER);
      doc.fillColor(GRAY).font('Helvetica').fontSize(8).text('No Photo', M, y + 42, { width: 90, align: 'center' });
    }

    const infoX = M + 110;
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(17).text(customer.full_name || '-', infoX, y);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(10).text(customer.shop_name || '-', infoX, y + 22);
    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text(`Customer ID: ${customer.id}`, infoX, y + 40);
    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
       .text(`Registered: ${customer.created_at ? new Date(customer.created_at).toLocaleDateString('en-GB') : '-'}`, infoX, y + 54);

    y += 112;
    doc.moveTo(M, y).lineTo(W - M, y).strokeColor('#DDDDDD').lineWidth(1).stroke();
    y += 18;

    const field = (label, value, width) => {
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5).text(label.toUpperCase(), M, y, { width });
      doc.fillColor(BLACK).font('Helvetica').fontSize(10.5).text(value || '-', M, y + 13, { width });
    };

    const colW = (W - M * 2 - 20) / 2;
    const col2X = M + colW + 20;

    field('Phone', customer.phone, colW);
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5).text('WHATSAPP NUMBER', col2X, y);
    doc.fillColor(BLACK).font('Helvetica').fontSize(10.5).text(customer.whatsapp_phone || '-', col2X, y + 13, { width: colW });
    y += 38;

    field('Email', customer.email, colW);
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5).text('NIC NUMBER', col2X, y);
    doc.fillColor(BLACK).font('Helvetica').fontSize(10.5).text(customer.nic_number || '-', col2X, y + 13, { width: colW });
    y += 38;

    field('Shop Name', customer.shop_name, colW);
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5).text('RATE TIER', col2X, y);
    doc.fillColor(BLACK).font('Helvetica').fontSize(10.5).text((customer.rate_tier || '-').toUpperCase(), col2X, y + 13, { width: colW });
    y += 38;

    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5).text('SHOP ADDRESS', M, y, { width: W - M * 2 });
    doc.fillColor(BLACK).font('Helvetica').fontSize(10.5).text(customer.shop_address || '-', M, y + 13, { width: W - M * 2 });
    y += 38;

    field('City', company?.name || customer.city, colW);
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5).text('AREA', col2X, y);
    doc.fillColor(BLACK).font('Helvetica').fontSize(10.5).text(customer.area || '-', col2X, y + 13, { width: colW });
    y += 50;

    // ── NIC IMAGE ──
    if (y > 560) { doc.addPage(); y = 45; }
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5).text('NIC IMAGE', M, y);
    y += 16;
    if (nicBuf) {
      try { doc.image(nicBuf, M, y, { fit: [280, 190] }); } catch (e) {}
    } else {
      doc.rect(M, y, 280, 170).fillAndStroke('#EEEEEE', BORDER);
      doc.fillColor(GRAY).font('Helvetica').fontSize(9).text('No NIC Image', M, y + 78, { width: 280, align: 'center' });
    }

    doc.fillColor(GRAY).font('Helvetica').fontSize(7.5)
       .text('Generated: ' + new Date().toLocaleString('en-GB'), M, 805, { width: W - M * 2, align: 'right' });

    doc.end();
  });
}

module.exports = { buildCustomerProfilePDF };
