const PDFDocument = require('pdfkit');
const path        = require('path');

const LOGO_PATH = path.join(__dirname, '../../assets/rhr-logo.jpeg');

// Pulls a human order number like "KHI-2026-00015" out of a ledger
// description ("Order KHI-2026-00015 confirmed") — same pattern the
// desktop Ledger page already uses to make it clickable, used here to
// give it its own column instead of leaving it buried in the text.
const ORDER_NUMBER_RE = /([A-Z]{2,5}-\d{4}-\d+)/;
function extractOrderNumber(description) {
  const match = (description || '').match(ORDER_NUMBER_RE);
  return match ? match[1] : '';
}

async function buildStatementPDF({ customer, company, entries, fromDate, toDate, currentBalance }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W         = 595;
    const M         = 40;
    const DARK_BLUE = '#1B2E6B';
    const ORANGE    = '#E8841A';
    const GRAY      = '#888888';
    const BLACK     = '#1A1A1A';
    const WHITE     = '#FFFFFF';
    const LINE_CLR  = '#DDDDDD';

    // ── HEADER — same branded layout as the order invoice (logo, name,
    // tagline, manufacturer line) so every document this company issues
    // reads as the same template, just with a different title on the right.
    try { doc.image(LOGO_PATH, M, 8, { width: 46, height: 46 }); } catch (e) {}
    const textX = M + 56;
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(18).text('RHR & COMPANY', textX, 10);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(8).text('THE SIGN OF QUALITY', textX, 29);
    doc.fillColor(GRAY).font('Helvetica').fontSize(6.5)
       .text('Manufacturer of: Tile Bond, Tile Grout, Readymix Plaster, Dry Wall Putty & Water Proofing Patlo', textX, 39, { width: 300 });

    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(16).text('LEDGER STATEMENT', 370, 12, { width: 185, align: 'right' });
    doc.fillColor(GRAY).font('Helvetica').fontSize(8).text('Print Date: ' + new Date().toLocaleDateString('en-GB'), 370, 32, { width: 185, align: 'right' });
    doc.text('Print Time: ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), 370, 43, { width: 185, align: 'right' });

    doc.moveTo(M, 58).lineTo(W - M, 58).strokeColor(ORANGE).lineWidth(1.5).stroke();

    // ── CUSTOMER INFO ──
    let y = 70;
    // Shop / business name is the main line, the person's name below it, small.
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(12).text(customer?.shop_name || customer?.full_name || 'Customer', M, y);
    y += 16;
    if (customer?.shop_name && customer?.full_name) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text('Contact: ' + customer.full_name, M, y);
      y += 14;
    }
    if (customer?.shop_address) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text(customer.shop_address, M, y, { width: 280 });
      y += 14;
    }
    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text('Phone: ' + (customer?.phone || '—'), M, y);

    const periodLabel = (fromDate || toDate) ? `${fromDate || 'Start'} to ${toDate || 'Today'}` : 'All Time';
    doc.fillColor(GRAY).font('Helvetica').fontSize(8).text('Period:', W - M - 200, 70, { width: 200, align: 'right' });
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9).text(periodLabel, W - M - 200, 82, { width: 200, align: 'right' });
    if (company?.name) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
         .text(company.name, W - M - 200, 96, { width: 200, align: 'right' });
    }

    // ── TABLE — Date | Order # | Description | Debit | Credit | Balance.
    // Description carries both the narration and (for order entries) a
    // real item summary ("2x Dry Wall Putty, 1x Tile Bond") on its own
    // line underneath, instead of just the generic "Order ... confirmed".
    const tableY = y + 26;
    const col = {
      date:    { x: M,        w: 56  },
      orderNo: { x: M + 56,   w: 76  },
      desc:    { x: M + 132,  w: 168 },
      debit:   { x: M + 300,  w: 65  },
      credit:  { x: M + 365,  w: 65  },
      balance: { x: M + 430,  w: 85  }
    };
    const tableW = W - M * 2;

    const drawTableHead = (atY) => {
      doc.rect(M, atY, tableW, 22).fill(DARK_BLUE);
      doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8);
      doc.text('DATE',        col.date.x    + 4, atY + 7);
      doc.text('ORDER #',     col.orderNo.x + 4, atY + 7);
      doc.text('DESCRIPTION', col.desc.x    + 4, atY + 7);
      doc.text('DEBIT',       col.debit.x,       atY + 7, { width: col.debit.w  - 4, align: 'right' });
      doc.text('CREDIT',      col.credit.x,      atY + 7, { width: col.credit.w - 4, align: 'right' });
      doc.text('BALANCE',     col.balance.x,     atY + 7, { width: col.balance.w - 4, align: 'right' });
      return atY + 22;
    };

    let rowY = drawTableHead(tableY);
    const pageBottom = 760;
    const DEBIT_CLR  = '#C0392B';
    const CREDIT_CLR = '#1A7A4A';

    entries.forEach((entry, index) => {
      const hasSummary = !!entry.itemsSummary;
      const rowH = hasSummary ? 30 : 20;

      if (rowY + rowH > pageBottom) {
        doc.addPage();
        rowY = drawTableHead(40);
      }

      const bg = index % 2 === 0 ? WHITE : '#F8F9FA';
      const typeColor = entry.entry_type === 'debit' ? DEBIT_CLR : CREDIT_CLR;

      doc.rect(M, rowY, tableW, rowH).fill(bg);
      doc.moveTo(M, rowY + rowH).lineTo(W - M, rowY + rowH).strokeColor(LINE_CLR).lineWidth(0.5).stroke();

      doc.fillColor(BLACK).font('Helvetica').fontSize(8);
      doc.text(new Date(entry.created_at).toLocaleDateString('en-GB'), col.date.x + 4, rowY + 6);
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(7.5);
      doc.text(extractOrderNumber(entry.description) || '—', col.orderNo.x + 4, rowY + 6, { width: col.orderNo.w - 6 });

      doc.fillColor(BLACK).font('Helvetica').fontSize(8);
      doc.text(entry.description || '-', col.desc.x + 4, rowY + 6, { width: col.desc.w - 8 });
      if (hasSummary) {
        doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(7)
           .text(entry.itemsSummary, col.desc.x + 4, rowY + 17, { width: col.desc.w - 8 });
      }

      doc.fillColor(typeColor).font('Helvetica-Bold').fontSize(8);
      if (entry.entry_type === 'debit') {
        doc.text(`${Number(entry.amount).toLocaleString()}`, col.debit.x, rowY + 6, { width: col.debit.w - 4, align: 'right' });
      } else {
        doc.text(`${Number(entry.amount).toLocaleString()}`, col.credit.x, rowY + 6, { width: col.credit.w - 4, align: 'right' });
      }

      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8);
      doc.text(Number(entry.running_balance).toLocaleString(), col.balance.x, rowY + 6, { width: col.balance.w - 4, align: 'right' });
      rowY += rowH;
    });

    // ── CLOSING BALANCE ──
    rowY += 10;
    if (rowY > pageBottom) { doc.addPage(); rowY = 45; }
    doc.rect(col.debit.x, rowY, col.debit.w + col.credit.w + col.balance.w, 26).fill(DARK_BLUE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9).text('CLOSING BALANCE', col.debit.x + 6, rowY + 8);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(11)
       .text(`PKR ${Number(currentBalance).toLocaleString()}`, col.balance.x, rowY + 7, { width: col.balance.w - 6, align: 'right' });

    // ── SIGNATURES ──
    const signY = rowY + 50;
    doc.moveTo(M, signY).lineTo(M + 150, signY).strokeColor('#AAAAAA').lineWidth(0.5).stroke();
    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text('Manager Signature', M, signY + 5);

    doc.moveTo(W - M - 150, signY).lineTo(W - M, signY).strokeColor('#AAAAAA').lineWidth(0.5).stroke();
    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text('Customer Signature', W - M - 150, signY + 5);

    doc.end();
  });
}

module.exports = { buildStatementPDF };
