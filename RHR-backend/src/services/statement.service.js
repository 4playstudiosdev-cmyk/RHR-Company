const PDFDocument = require('pdfkit');
const path        = require('path');

const LOGO_PATH = path.join(__dirname, '../../assets/rhr-logo.jpeg');

async function buildStatementPDF({ customer, company, entries, fromDate, toDate, currentBalance }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    const chunks = [];
    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W         = 595;
    const M         = 45;
    const DARK_BLUE = '#1B2E6B';
    const ORANGE    = '#E8841A';
    const GRAY      = '#888888';
    const BLACK     = '#1A1A1A';
    const WHITE     = '#FFFFFF';
    const LINE_CLR  = '#DDDDDD';

    // ── HEADER ──
    doc.rect(0, 0, W, 90).fill(DARK_BLUE);
    try { doc.image(LOGO_PATH, M, 15, { width: 60, height: 60 }); } catch (e) {}
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(20).text('RHR & COMPANY', M + 72, 24);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(9).text('THE SIGN OF QUALITY', M + 72, 48);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(24).text('LEDGER STATEMENT', 300, 32, { width: 250, align: 'right' });

    doc.moveTo(M, 98).lineTo(W - M, 98).strokeColor(ORANGE).lineWidth(2).stroke();

    // ── CUSTOMER INFO ──
    let y = 115;
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(12).text(customer?.full_name || 'Customer', M, y);
    y += 16;
    if (customer?.shop_name) {
      doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(10).text(customer.shop_name, M, y);
      y += 14;
    }
    if (customer?.shop_address) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text(customer.shop_address, M, y, { width: 280 });
      y += 14;
    }
    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text('Phone: ' + (customer?.phone || '—'), M, y);

    const periodLabel = (fromDate || toDate) ? `${fromDate || 'Start'} to ${toDate || 'Today'}` : 'All Time';
    doc.fillColor(GRAY).font('Helvetica').fontSize(8).text('Period:', W - M - 200, 115, { width: 200, align: 'right' });
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9).text(periodLabel, W - M - 200, 127, { width: 200, align: 'right' });
    doc.fillColor(GRAY).font('Helvetica').fontSize(8)
       .text('Generated: ' + new Date().toLocaleDateString('en-GB'), W - M - 200, 141, { width: 200, align: 'right' });
    if (company?.name) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
         .text(company.name, W - M - 200, 155, { width: 200, align: 'right' });
    }

    // ── TABLE ──
    const tableY = y + 30;
    const col = {
      date:    { x: M,        w: 70  },
      desc:    { x: M + 70,   w: 190 },
      type:    { x: M + 260,  w: 65  },
      amount:  { x: M + 325,  w: 90  },
      balance: { x: M + 415,  w: 90  }
    };
    const tableW = W - M * 2;

    doc.rect(M, tableY, tableW, 24).fill(DARK_BLUE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8.5);
    doc.text('DATE',        col.date.x    + 4, tableY + 8);
    doc.text('DESCRIPTION', col.desc.x    + 4, tableY + 8);
    doc.text('TYPE',        col.type.x    + 4, tableY + 8);
    doc.text('AMOUNT',      col.amount.x,      tableY + 8, { width: col.amount.w  - 4, align: 'right' });
    doc.text('BALANCE',     col.balance.x,     tableY + 8, { width: col.balance.w - 4, align: 'right' });

    let rowY = tableY + 24;
    const pageBottom = 780;
    const DEBIT_CLR  = '#C0392B';
    const CREDIT_CLR = '#1A7A4A';

    entries.forEach((entry, index) => {
      if (rowY > pageBottom) {
        doc.addPage();
        rowY = 45;
      }
      const bg = index % 2 === 0 ? WHITE : '#F8F9FA';
      const typeColor = entry.entry_type === 'debit' ? DEBIT_CLR : CREDIT_CLR;

      doc.rect(M, rowY, tableW, 22).fill(bg);
      doc.moveTo(M, rowY + 22).lineTo(W - M, rowY + 22).strokeColor(LINE_CLR).lineWidth(0.5).stroke();

      doc.fillColor(BLACK).font('Helvetica').fontSize(8.5);
      doc.text(new Date(entry.created_at).toLocaleDateString('en-GB'), col.date.x + 4, rowY + 7);
      doc.text(entry.description || '-', col.desc.x + 4, rowY + 7, { width: col.desc.w - 8 });

      doc.fillColor(typeColor).font('Helvetica-Bold').fontSize(8);
      doc.text((entry.entry_type || '-').toUpperCase(), col.type.x + 4, rowY + 7);
      doc.text(`PKR ${Number(entry.amount).toLocaleString()}`, col.amount.x, rowY + 7, { width: col.amount.w - 4, align: 'right' });

      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8.5);
      doc.text(Number(entry.running_balance).toLocaleString(), col.balance.x, rowY + 7, { width: col.balance.w - 4, align: 'right' });
      rowY += 22;
    });

    // ── CLOSING BALANCE ──
    rowY += 10;
    if (rowY > pageBottom) { doc.addPage(); rowY = 45; }
    doc.rect(col.amount.x, rowY, col.amount.w + col.balance.w, 26).fill(DARK_BLUE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9).text('CLOSING BALANCE', col.amount.x + 6, rowY + 8);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(11)
       .text(`PKR ${Number(currentBalance).toLocaleString()}`, col.balance.x, rowY + 7, { width: col.balance.w - 6, align: 'right' });

    doc.end();
  });
}

module.exports = { buildStatementPDF };
