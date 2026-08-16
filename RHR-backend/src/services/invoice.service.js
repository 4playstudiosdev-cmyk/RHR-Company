const PDFDocument = require('pdfkit');
const path        = require('path');
const { supabaseAdmin } = require('../config/supabase');

const LOGO_PATH = path.join(__dirname, '../../assets/rhr-logo.jpeg');

async function generateInvoice(orderId) {
  try {
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        order_items(*),
        users!customer_id(full_name, phone, email, shop_name, shop_address),
        companies(name, city, phone, address)
      `)
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      console.error('Invoice generation failed — order not found:', orderId);
      return null;
    }

    let salesmanName = null;
    if (order.salesman_id) {
      const { data: salesman } = await supabaseAdmin
        .from('salesmen')
        .select('full_name')
        .eq('id', order.salesman_id)
        .single();
      salesmanName = salesman?.full_name || null;
    }

    const pdfBuffer = await buildInvoicePDF(order, salesmanName);

    const filePath = `${order.company_id}/invoices/${order.order_number}.pdf`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('invoices')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadErr) {
      console.error('Invoice upload failed:', uploadErr.message);
      return null;
    }

    await supabaseAdmin
      .from('orders')
      .update({ invoice_url: filePath })
      .eq('id', orderId);

    console.log(`✅ Invoice generated: ${filePath}`);
    return filePath;

  } catch (err) {
    console.error('Invoice generation error:', err.message);
    return null;
  }
}

async function buildInvoicePDF(order, salesmanName) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];
    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W         = 595;
    const H         = 842;
    const M         = 45;
    const DARK_BLUE = '#1B2E6B';
    const ORANGE    = '#E8841A';
    const GRAY      = '#888888';
    const LIGHT     = '#F5F5F5';
    const BLACK     = '#1A1A1A';
    const WHITE     = '#FFFFFF';
    const LINE_CLR  = '#DDDDDD';

    // ── WATERMARK ──
    try {
      doc.save();
      doc.opacity(0.05);
      doc.image(LOGO_PATH, (W - 300) / 2, (H - 300) / 2, { width: 300, height: 300 });
      doc.restore();
    } catch (e) {}

    // ── HEADER BAR ──
    doc.rect(0, 0, W, 115).fill(DARK_BLUE);
    try { doc.image(LOGO_PATH, M, 18, { width: 75, height: 75 }); } catch (e) {}

    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(22)
       .text('RHR & COMPANY', M + 88, 26);
    doc.fillColor('#BDD7EE').font('Helvetica').fontSize(7.5)
       .text('MANUFACTURER OF: TILE BOND, TILE GROUD, READYMIX PLASTER, DRY WALL PUTTY & WATER PROOFING PATLO',
             M + 88, 52, { width: 280 });
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(8)
       .text('THE SIGN OF QUALITY', M + 88, 74);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(34)
       .text('INVOICE', 370, 36, { width: 180, align: 'right' });

    doc.moveTo(M, 123).lineTo(W - M, 123).strokeColor(ORANGE).lineWidth(2).stroke();

    // ── META BAR ──
    const metaY = 132;
    doc.rect(M, metaY, W - M * 2, 38).fill(DARK_BLUE);

    doc.fillColor('#BDD7EE').font('Helvetica').fontSize(7.5).text('INVOICE #', M + 12, metaY + 7);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(11).text(order.order_number, M + 12, metaY + 18);

    doc.moveTo(M + 170, metaY + 6).lineTo(M + 170, metaY + 32).strokeColor('#FFFFFF').lineWidth(0.3).stroke();

    const dateStr = new Date(order.created_at).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    doc.fillColor('#BDD7EE').font('Helvetica').fontSize(7.5).text('DATE', M + 182, metaY + 7);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(11).text(dateStr, M + 182, metaY + 18);

    doc.moveTo(M + 320, metaY + 6).lineTo(M + 320, metaY + 32).strokeColor('#FFFFFF').lineWidth(0.3).stroke();

    doc.fillColor('#BDD7EE').font('Helvetica').fontSize(7.5).text('STATUS', M + 332, metaY + 7);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(11).text(order.status.toUpperCase(), M + 332, metaY + 18);

    // ── BILL TO SECTION ──
    const billY    = metaY + 56;
    const customer = order['users'];
    const company  = order.companies;

    // BILL TO label
    doc.rect(M, billY, 56, 15).fill(DARK_BLUE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8).text('BILL TO:', M + 4, billY + 4);

    // Customer name
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(12)
       .text(customer?.full_name || 'Customer', M, billY + 22);

    // Shop name — shown in orange if available
    let billOffset = 38;
    if (customer?.shop_name) {
      doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(10)
         .text(customer.shop_name, M, billY + billOffset);
      billOffset += 15;
    }

    // Shop address
    if (customer?.shop_address) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
         .text(customer.shop_address, M, billY + billOffset, { width: 250 });
      billOffset += 14;
    }

    // Phone
    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
       .text('Phone: ' + (customer?.phone || '—'), M, billY + billOffset);

    // FROM — right side
    doc.fillColor(GRAY).font('Helvetica').fontSize(8)
       .text('From:', W - M - 200, billY + 22, { width: 200, align: 'right' });
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9)
       .text('RHR & Company — ' + (company?.city || 'KHI'),
             W - M - 200, billY + 34, { width: 200, align: 'right' });
    doc.fillColor(GRAY).font('Helvetica').fontSize(8)
       .text('Ph: ' + (company?.phone || '0332-2110690'),
             W - M - 200, billY + 48, { width: 200, align: 'right' });
    if (salesmanName) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
         .text('Sales Rep: ' + salesmanName,
               W - M - 200, billY + 62, { width: 200, align: 'right' });
    }

    // ── ITEMS TABLE ──
    const tableY = billY + 105;
    const col = {
      sno:    { x: M,        w: 34  },
      desc:   { x: M + 34,   w: 228 },
      qty:    { x: M + 262,  w: 62  },
      rate:   { x: M + 324,  w: 90  },
      amount: { x: M + 414,  w: 91  },
    };
    const tableW = W - M * 2;

    doc.rect(M, tableY, tableW, 26).fill(DARK_BLUE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9);
    doc.text('S.NO',        col.sno.x    + 4, tableY + 9);
    doc.text('PARTICULARS', col.desc.x   + 4, tableY + 9);
    doc.text('QTY',         col.qty.x    + 4, tableY + 9);
    doc.text('RATE',        col.rate.x   + 4, tableY + 9);
    doc.text('AMOUNT',      col.amount.x + 4, tableY + 9, { width: col.amount.w - 8, align: 'right' });

    const items = order.order_items || [];
    let rowY = tableY + 26;

    items.forEach((item, index) => {
      const bg = index % 2 === 0 ? WHITE : '#F8F9FA';
      doc.rect(M, rowY, tableW, 24).fill(bg);
      doc.moveTo(M, rowY + 24).lineTo(W - M, rowY + 24).strokeColor(LINE_CLR).lineWidth(0.5).stroke();
      doc.fillColor(BLACK).font('Helvetica').fontSize(9);
      doc.text(`${index + 1}`,                                    col.sno.x    + 4, rowY + 8);
      doc.text(item.product_name,                                  col.desc.x   + 4, rowY + 8, { width: col.desc.w - 8 });
      doc.text(`${item.quantity}`,                                 col.qty.x    + 4, rowY + 8);
      doc.text(`PKR ${Number(item.unit_price).toLocaleString()}`,  col.rate.x   + 4, rowY + 8);
      doc.text(`PKR ${Number(item.subtotal).toLocaleString()}`,    col.amount.x + 4, rowY + 8, { width: col.amount.w - 8, align: 'right' });
      rowY += 24;
    });

    const emptyRows = Math.max(0, 6 - items.length);
    for (let i = 0; i < emptyRows; i++) {
      const bg = (items.length + i) % 2 === 0 ? WHITE : '#F8F9FA';
      doc.rect(M, rowY, tableW, 24).fill(bg);
      doc.moveTo(M, rowY + 24).lineTo(W - M, rowY + 24).strokeColor(LINE_CLR).lineWidth(0.5).stroke();
      rowY += 24;
    }

    // ── IN WORDS + TOTAL ──
    const totalY   = rowY;
    const totalAmt = Number(order.total_amount);

    doc.rect(M, totalY, col.rate.x - M, 28).fill(LIGHT);
    doc.moveTo(M, totalY + 28).lineTo(W - M, totalY + 28).strokeColor(LINE_CLR).lineWidth(0.5).stroke();
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8).text('IN WORDS:', M + 6, totalY + 9);
    doc.fillColor(BLACK).font('Helvetica').fontSize(8)
       .text(`PKR ${totalAmt.toLocaleString()} Only`, M + 70, totalY + 9, { width: 190 });

    doc.rect(col.rate.x, totalY, col.rate.w + col.amount.w, 28).fill(DARK_BLUE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(10).text('TOTAL', col.rate.x + 6, totalY + 9);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(12)
       .text(`PKR ${totalAmt.toLocaleString()}`, col.amount.x + 4, totalY + 8,
             { width: col.amount.w - 8, align: 'right' });

    // ── NOTES ──
    let sigY = totalY + 44;
    if (order.notes) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8).text('Notes: ' + order.notes, M, sigY);
      sigY += 18;
    }

    // ── SIGNATURES ──
    const signY = Math.max(sigY + 40, totalY + 90);

    doc.moveTo(M, signY).lineTo(M + 160, signY).strokeColor('#AAAAAA').lineWidth(0.5).stroke();
    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text('Prepared by:', M, signY + 5);
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(9)
       .text(salesmanName || 'RHR & Company', M, signY + 18);

    doc.moveTo(W - M - 160, signY).lineTo(W - M, signY).strokeColor('#AAAAAA').lineWidth(0.5).stroke();
    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text('Received by:', W - M - 160, signY + 5);

    // ── FOOTER ──
    doc.rect(0, H - 38, W, 38).fill(ORANGE);
    doc.fillColor(WHITE).font('Helvetica').fontSize(8)
       .text('RHR & Company  |  Manufacturer of Construction Materials  |  Karachi, Pakistan  |  0332-2110690',
             M, H - 23, { width: W - M * 2, align: 'center' });

    doc.end();
  });
}

module.exports = { generateInvoice };