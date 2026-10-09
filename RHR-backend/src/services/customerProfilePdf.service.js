const https       = require('https');
const PDFDocument  = require('pdfkit');
const path         = require('path');

const LOGO_PATH = path.join(__dirname, '../../assets/rhr-logo.jpeg');

// profile_photo_url / nic_image_url / nic_back_image_url are all plain
// https URLs (public Supabase Storage URL or a signed URL) — pdfkit's
// doc.image() needs an actual buffer/path, not a URL, so this downloads
// the bytes first. Best-effort: a dead/missing image just renders as a
// placeholder box rather than failing the whole PDF.
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

const W   = 595;
const M   = 40;
const CW  = W - M * 2;           // content width
const MID = M + CW / 2;          // vertical divider between the two columns

const DARK_BLUE = '#1B2E6B';
const ORANGE    = '#E8841A';
const GRAY      = '#8A8A8A';
const BLACK     = '#1A1A1A';
const WHITE     = '#FFFFFF';
const LINE_CLR  = '#D8DCE5';
const ROW_BG    = '#F7F8FB';

async function buildCustomerProfilePDF(customer, company) {
  const [profileBuf, nicFrontBuf, nicBackBuf] = await Promise.all([
    fetchImageBuffer(customer.profile_photo_url),
    fetchImageBuffer(customer.nic_image_url),
    fetchImageBuffer(customer.nic_back_image_url),
  ]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];
    doc.on('data',  (c) => chunks.push(c));
    doc.on('end',   ()  => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── TOP BANNER ──
    const bannerH = 100;
    doc.rect(0, 0, W, bannerH).fill(DARK_BLUE);
    try { doc.image(LOGO_PATH, M, 18, { width: 60, height: 60 }); } catch (e) {}
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(19).text('RHR & COMPANY', M + 72, 24);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(8.5).text('THE SIGN OF QUALITY', M + 72, 46);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(11).text('CUSTOMER PROFILE REPORT', M + 72, 62);

    // Photo box — top-right of the banner
    const photoW = 70, photoH = 70;
    const photoX = W - M - photoW, photoY = (bannerH - photoH) / 2;
    doc.rect(photoX, photoY, photoW, photoH).fill(WHITE);
    if (profileBuf) {
      try { doc.image(profileBuf, photoX + 2, photoY + 2, { width: photoW - 4, height: photoH - 4, fit: [photoW - 4, photoH - 4] }); } catch (e) {}
    } else {
      doc.fillColor(GRAY).font('Helvetica').fontSize(7.5).text('No Photo', photoX, photoY + photoH / 2 - 4, { width: photoW, align: 'center' });
    }

    // ── REG / DATE STRIP ──
    let y = bannerH;
    const stripH = 26;
    doc.rect(0, y, W, stripH).fill(ROW_BG);
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8).text('CUSTOMER ID', M, y + 8);
    doc.fillColor(BLACK).font('Helvetica').fontSize(8).text(customer.id, M + 75, y + 8, { width: 250 });
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8).text('DATE OF ISSUE', W - M - 160, y + 8, { width: 90, align: 'right' });
    doc.fillColor(BLACK).font('Helvetica').fontSize(8)
       .text(new Date().toLocaleDateString('en-GB'), W - M - 60, y + 8, { width: 60, align: 'right' });
    y += stripH;

    // ── Section bar helper ──
    const sectionBar = (title) => {
      doc.rect(M, y, CW, 22).fill(DARK_BLUE);
      doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(10).text(title, M + 10, y + 6);
      y += 22;
    };

    // ── Table row helpers (grid lines + label/value cells) ──
    const rowH = 36;
    const cellPad = 10;

    const tableRowTwoCol = (l1, v1, l2, v2, shade) => {
      if (shade) doc.rect(M, y, CW, rowH).fill(ROW_BG);
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7.5).text(l1.toUpperCase(), M + cellPad, y + 7);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10).text(v1 || '-', M + cellPad, y + 19, { width: CW / 2 - cellPad * 2 });
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7.5).text(l2.toUpperCase(), MID + cellPad, y + 7);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10).text(v2 || '-', MID + cellPad, y + 19, { width: CW / 2 - cellPad * 2 });
      doc.moveTo(MID, y).lineTo(MID, y + rowH).strokeColor(LINE_CLR).lineWidth(0.75).stroke();
      doc.moveTo(M, y + rowH).lineTo(W - M, y + rowH).strokeColor(LINE_CLR).lineWidth(0.75).stroke();
      y += rowH;
    };

    const tableRowFull = (label, value, shade) => {
      if (shade) doc.rect(M, y, CW, rowH).fill(ROW_BG);
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7.5).text(label.toUpperCase(), M + cellPad, y + 7);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10).text(value || '-', M + cellPad, y + 19, { width: CW - cellPad * 2 });
      doc.moveTo(M, y + rowH).lineTo(W - M, y + rowH).strokeColor(LINE_CLR).lineWidth(0.75).stroke();
      y += rowH;
    };

    // ── CLIENT INFORMATION ──
    sectionBar('CLIENT INFORMATION');
    const tableTop = y;
    tableRowTwoCol('Full Name', customer.full_name, 'Shop Name', customer.shop_name, false);
    tableRowTwoCol('Phone Number', customer.phone, 'WhatsApp Number', customer.whatsapp_phone, true);
    tableRowTwoCol('Email Address', customer.email, 'NIC Number', customer.nic_number, false);
    tableRowTwoCol('City', company?.name || customer.city, 'Area', customer.area, true);
    tableRowTwoCol('Rate Tier', (customer.rate_tier || '-').toUpperCase(), 'Registered On',
      customer.created_at ? new Date(customer.created_at).toLocaleDateString('en-GB') : '-', false);
    tableRowFull('Shop Address', customer.shop_address, true);
    doc.rect(M, tableTop, CW, y - tableTop).strokeColor(LINE_CLR).lineWidth(1).stroke();

    y += 18;

    // ── IDENTIFICATION DOCUMENTS ──
    sectionBar('IDENTIFICATION DOCUMENTS');
    y += 10;

    const nicBoxW = (CW - 16) / 2;
    const nicBoxH = 170;
    const nicLabelH = 20;

    const nicBox = (x, label, buf) => {
      doc.rect(x, y, nicBoxW, nicLabelH).fill(ROW_BG);
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(8.5).text(label, x + 8, y + 6);
      const imgY = y + nicLabelH;
      const imgH = nicBoxH - nicLabelH;
      doc.rect(x, imgY, nicBoxW, imgH).strokeColor(LINE_CLR).lineWidth(1).stroke();
      if (buf) {
        try { doc.image(buf, x + 4, imgY + 4, { fit: [nicBoxW - 8, imgH - 8], align: 'center', valign: 'center' }); } catch (e) {}
      } else {
        doc.fillColor(GRAY).font('Helvetica').fontSize(9).text('No Image', x, imgY + imgH / 2 - 5, { width: nicBoxW, align: 'center' });
      }
      doc.rect(x, y, nicBoxW, nicBoxH).strokeColor(LINE_CLR).lineWidth(1).stroke();
    };

    nicBox(M, 'NIC — FRONT', nicFrontBuf);
    nicBox(MID + 8, 'NIC — BACK', nicBackBuf);
    y += nicBoxH;

    // ── FOOTER ──
    const footerY = 800;
    doc.moveTo(M, footerY).lineTo(W - M, footerY).strokeColor(LINE_CLR).lineWidth(0.75).stroke();
    doc.fillColor(GRAY).font('Helvetica').fontSize(7.5)
       .text('RHR & Company — Internal Use Only', M, footerY + 6);
    doc.fillColor(GRAY).font('Helvetica').fontSize(7.5)
       .text('Generated: ' + new Date().toLocaleString('en-GB'), M, footerY + 6, { width: CW, align: 'right' });

    doc.end();
  });
}

module.exports = { buildCustomerProfilePDF };
