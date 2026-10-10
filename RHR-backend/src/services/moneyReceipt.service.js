const PDFDocument = require('pdfkit');
const path = require('path');
const { numberToWordsPKR } = require('../utils/numberToWords');

const LOGO_PATH = path.join(__dirname, '../../assets/rhr-logo.jpeg');

const DARK_BLUE = '#0F2A52';
const ORANGE    = '#E8841A';
const BLACK     = '#1A1A1A';
const GRAY      = '#6B7280';
const WHITE     = '#FFFFFF';

// Matches the client-supplied "Money Receipt" template: diagonal navy/
// orange header band, NO./Date row, a labelled form section with dotted
// fill lines, ACCT/PAID/DUE row, a boxed total, and Received By /
// Authorized Signature at the bottom. status is 'pending' or 'approved'
// — stamped in the corner since the payment may still be awaiting admin
// review when this is generated and sent.
function buildMoneyReceiptPDF({ receiptNo, payment, customer, salesman, company, status }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', layout: 'landscape', margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = 595, H = 420; // A5 landscape points
    const M = 28;

    // ── THIN DIAGONAL ACCENT STRIP (not a full band — the title sits
    // below it on the plain background, matching the reference template
    // where the colored diagonal is just a top border accent) ──
    const stripH = 14;
    doc.rect(0, 0, W, stripH).fill(DARK_BLUE);
    doc.polygon([W * 0.62, 0], [W, 0], [W, stripH], [W * 0.50, stripH]).fill(ORANGE);

    // Logo box top-left
    doc.roundedRect(M, stripH + 8, 56, 48, 4).strokeColor('#E5E7EB').lineWidth(1).stroke();
    try { doc.image(LOGO_PATH, M + 4, stripH + 12, { width: 48, height: 40, fit: [48, 40] }); } catch (e) {}

    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(22).text('MONEY RECEIPT', 0, stripH + 12, { width: W, align: 'center' });
    doc.fillColor(GRAY).font('Helvetica').fontSize(8)
       .text('RHR & Company — The Sign of Quality', 0, stripH + 38, { width: W, align: 'center' });

    const companyName = company?.name || 'RHR & Company';
    const companyAddr = company?.address || company?.city || '';
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(9).text(companyName, W - M - 170, stripH + 10, { width: 170, align: 'right' });
    if (companyAddr) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(7.5).text(companyAddr, W - M - 170, stripH + 22, { width: 170, align: 'right' });
    }
    if (company?.phone) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(7.5).text(company.phone, W - M - 170, stripH + 33, { width: 170, align: 'right' });
    }

    let y = stripH + 68;
    doc.moveTo(0, y - 6).lineTo(W, y - 6).strokeColor(ORANGE).lineWidth(2).stroke();

    // ── NO. / DATE ──
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10).text('NO.', M, y);
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(10).text(receiptNo, M + 30, y);
    const dateStr = new Date(payment.created_at || Date.now()).toLocaleDateString('en-GB');
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10).text('Date', W - M - 150, y, { width: 90 });
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(10).text(dateStr, W - M - 60, y, { width: 60, align: 'right' });
    doc.moveTo(M, y + 18).lineTo(W - M, y + 18).strokeColor('#DDDDDD').lineWidth(1).stroke();
    y += 30;

    const dottedLine = (x1, x2, yy) => {
      doc.save();
      doc.dash(1.5, { space: 2 }).moveTo(x1, yy).lineTo(x2, yy).strokeColor('#999999').lineWidth(1).stroke();
      doc.undash();
      doc.restore();
    };

    const row = (label, value, width) => {
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10).text(label, M, y);
      const labelW = doc.widthOfString(label) + 10;
      dottedLine(M + labelW, M + (width || (W - M * 2)), y + 12);
      doc.fillColor(DARK_BLUE).font('Helvetica').fontSize(10).text(value || '', M + labelW + 4, y - 1, { width: (width || (W - M * 2)) - labelW - 8 });
      y += 26;
    };

    row('Received with thanks from', customer?.full_name || '-');
    row('Amount', `PKR ${Number(payment.amount).toLocaleString()}`);
    row('In word', numberToWordsPKR(payment.amount));

    // For / Branch side by side
    const halfW = (W - M * 2 - 20) / 2;
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10).text('For', M, y);
    dottedLine(M + 24, M + halfW, y + 12);
    doc.fillColor(DARK_BLUE).font('Helvetica').fontSize(9.5)
       .text(payment.notes || (payment.order_id ? `Order #${payment.order_id.slice(0, 8)}` : 'Account Payment'), M + 28, y - 1, { width: halfW - 32 });

    const branchX = M + halfW + 20;
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10).text('Branch', branchX, y);
    dottedLine(branchX + 42, W - M, y + 12);
    doc.fillColor(DARK_BLUE).font('Helvetica').fontSize(9.5).text(companyName, branchX + 46, y - 1, { width: W - M - branchX - 50 });
    y += 30;

    // ACCT. / PAID / DUE
    const col3 = (W - M * 2) / 3;
    const methodLabel = (payment.method || 'cash').toUpperCase();
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9.5).text('ACCT.', M, y);
    dottedLine(M + 32, M + col3 - 8, y + 11);
    doc.fillColor(DARK_BLUE).font('Helvetica').fontSize(9.5).text(methodLabel, M + 36, y - 1);

    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9.5).text('PAID', M + col3, y);
    dottedLine(M + col3 + 30, M + col3 * 2 - 8, y + 11);
    doc.fillColor(DARK_BLUE).font('Helvetica').fontSize(9.5).text(Number(payment.amount).toLocaleString(), M + col3 + 34, y - 1);

    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9.5).text('DUE', M + col3 * 2, y);
    dottedLine(M + col3 * 2 + 28, W - M, y + 11);
    y += 34;

    // ── Amount = [boxed] ──
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text('Amount =', M, y + 6);
    doc.rect(M + 65, y, 150, 26).strokeColor(DARK_BLUE).lineWidth(1).stroke();
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(13)
       .text(`PKR ${Number(payment.amount).toLocaleString()}`, M + 65, y + 7, { width: 150, align: 'center' });

    // Status stamp — top-right of this row
    const stampColor = status === 'approved' ? '#1A7A4A' : ORANGE;
    const stampText = status === 'approved' ? 'APPROVED' : 'PENDING APPROVAL';
    doc.save();
    doc.rotate(-8, { origin: [W - M - 70, y + 13] });
    doc.roundedRect(W - M - 130, y - 4, 120, 22, 4).lineWidth(1.5).strokeColor(stampColor).stroke();
    doc.fillColor(stampColor).font('Helvetica-Bold').fontSize(9).text(stampText, W - M - 130, y + 3, { width: 120, align: 'center' });
    doc.restore();

    y += 46;

    // ── Received by / Authorized Signature ──
    doc.moveTo(M, y + 20).lineTo(M + 150, y + 20).strokeColor('#AAAAAA').lineWidth(0.75).stroke();
    doc.fillColor(GRAY).font('Helvetica').fontSize(8).text(salesman?.full_name || 'RHR & Company', M, y + 24, { width: 150, align: 'center' });
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8.5).text('Received by', M, y + 36, { width: 150, align: 'center' });

    doc.moveTo(W - M - 150, y + 20).lineTo(W - M, y + 20).strokeColor('#AAAAAA').lineWidth(0.75).stroke();
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8.5).text('Authorized Signature', W - M - 150, y + 24, { width: 150, align: 'center' });

    // ── Bottom accent strip, mirroring the top ──
    doc.rect(0, H - stripH, W, stripH).fill(DARK_BLUE);
    doc.polygon([0, H - stripH], [W * 0.38, H - stripH], [W * 0.50, H], [0, H]).fill(ORANGE);

    doc.end();
  });
}

module.exports = { buildMoneyReceiptPDF };
