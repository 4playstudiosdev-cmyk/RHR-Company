const PDFDocument = require('pdfkit');
const { supabaseAdmin } = require('../config/supabase');

// ─────────────────────────────────────────────────────
// MAIN FUNCTION — called by orders.service.js
// ─────────────────────────────────────────────────────
async function generateInvoice(orderId) {
  try {
    // Step 1: Fetch complete order data
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        order_items(*),
        users!customer_id(full_name, phone, email),
        companies(name, city, phone, address)
      `)
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      console.error('Invoice generation failed — order not found:', orderId);
      return null;
    }

    // Step 2: Fetch salesman name if order was placed by salesman
    let salesmanName = null;
    if (order.salesman_id) {
      const { data: salesman } = await supabaseAdmin
        .from('users')
        .select('full_name')
        .eq('id', order.salesman_id)
        .single();
      salesmanName = salesman?.full_name || null;
    }

    // Step 3: Build the PDF
    const pdfBuffer = await buildInvoicePDF(order, salesmanName);

    // Step 4: Upload to Supabase Storage
    const filePath = `${order.company_id}/invoices/${order.order_number}.pdf`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('invoices')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
        duplex: 'half'
      });

    if (uploadErr) {
      console.error('Invoice upload error FULL:', JSON.stringify(uploadErr, null, 2));
      console.error('File path attempted:', filePath);
      console.error('Buffer size:', pdfBuffer.length);
      return null;
    }

    // Step 5: Save file path to orders table
    await supabaseAdmin
      .from('orders')
      .update({ invoice_url: filePath })
      .eq('id', orderId);

    console.log(`Invoice generated: ${filePath}`);
    return filePath;

  } catch (err) {
    console.error('Invoice generation error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────
// PDF BUILDER — draws the complete invoice using PDFKit
// ─────────────────────────────────────────────────────
async function buildInvoicePDF(order, salesmanName) {
  const doc = new PDFDocument({
    size:   'A4',
    margin: 50
  });

  // ── COLORS ──
  const DARK  = '#1E3A5F';
  const BLUE  = '#2E75B6';
  const GRAY  = '#6C757D';
  const LIGHT = '#F8F9FA';
  const BLACK = '#2C3E50';

  // ── PAGE DIMENSIONS ──
  const pageW  = 595;
  const margin = 50;
  const colW   = pageW - margin * 2;  // 495 usable width

  // ════════════════════════════════════════
  // HEADER SECTION
  // ════════════════════════════════════════
  // Dark blue header background
  doc.rect(0, 0, pageW, 110).fill(DARK);

  // Company name — left side
  doc.fillColor('#FFFFFF')
     .font('Helvetica-Bold')
     .fontSize(22)
     .text('RHR & COMPANY', margin, 28);

  // Company tagline
  doc.font('Helvetica')
     .fontSize(9)
     .fillColor('#BDD7EE')
     .text('Construction Materials Manufacturer', margin, 54);

  // Branch and contact — below tagline
  const company = order.companies;
  const branchLine = `Branch: ${company?.city || 'KHI'}  |  ${company?.phone || '0332211069'}  |  Riazh1974@gmail.com`;
  doc.fontSize(8).text(branchLine, margin, 68);

  // INVOICE label — right side
  doc.font('Helvetica-Bold')
     .fontSize(28)
     .fillColor('#FFFFFF')
     .text('INVOICE', 400, 32, { width: 145, align: 'right' });

  // ════════════════════════════════════════
  // INVOICE META — below header
  // ════════════════════════════════════════
  let y = 130;

  // Light gray background for meta row
  doc.rect(margin, y, colW, 52).fill(LIGHT);

  // Invoice number
  doc.fillColor(GRAY).font('Helvetica').fontSize(8)
     .text('INVOICE NUMBER', margin + 10, y + 8);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
     .text(order.order_number, margin + 10, y + 20);

  // Date
  doc.fillColor(GRAY).font('Helvetica').fontSize(8)
     .text('DATE', margin + 160, y + 8);
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11)
     .text(new Date(order.created_at).toLocaleDateString('en-GB', {
       day: '2-digit', month: 'short', year: 'numeric'
     }), margin + 160, y + 20);

  // Status badge
  doc.fillColor(GRAY).font('Helvetica').fontSize(8)
     .text('STATUS', margin + 300, y + 8);
  doc.rect(margin + 298, y + 18, 80, 18).fill(BLUE);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9)
     .text(order.status.toUpperCase(), margin + 300, y + 22, { width: 76, align: 'center' });

  y += 68;

  // ════════════════════════════════════════
  // BILL TO + SALESMAN
  // ════════════════════════════════════════
  const customer = order['users'];

  // Left column — Bill To
  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(9)
     .text('BILL TO', margin, y);
  doc.moveTo(margin, y + 12).lineTo(margin + 200, y + 12).strokeColor(BLUE).lineWidth(1).stroke();

  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11)
     .text(customer?.full_name || 'Customer', margin, y + 18);
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
     .text(`Phone: ${customer?.phone || '—'}`, margin, y + 32);

  if (order.delivery_address) {
    doc.text(`Address: ${order.delivery_address}`, margin, y + 44);
  }

  // Right column — Salesman / Prepared By
  if (salesmanName) {
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(9)
       .text('PREPARED BY', margin + 280, y);
    doc.moveTo(margin + 280, y + 12).lineTo(pageW - margin, y + 12).strokeColor(BLUE).lineWidth(1).stroke();
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11)
       .text(salesmanName, margin + 280, y + 18);
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
       .text('Sales Representative', margin + 280, y + 32);
  }

  y += 80;

  // ════════════════════════════════════════
  // ITEMS TABLE HEADER
  // ════════════════════════════════════════
  const col = {
    num:      { x: margin,       w: 30  },
    product:  { x: margin + 30,  w: 220 },
    qty:      { x: margin + 250, w: 60  },
    price:    { x: margin + 310, w: 85  },
    subtotal: { x: margin + 395, w: 100 },
  };

  // Table header background
  doc.rect(margin, y, colW, 24).fill(DARK);

  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
  doc.text('#',          col.num.x + 4,      y + 8);
  doc.text('PRODUCT',    col.product.x + 4,  y + 8);
  doc.text('QTY',        col.qty.x + 4,      y + 8);
  doc.text('UNIT PRICE', col.price.x + 4,    y + 8);
  doc.text('SUBTOTAL',   col.subtotal.x + 4, y + 8, { width: col.subtotal.w - 8, align: 'right' });

  y += 28;

  // ════════════════════════════════════════
  // ITEMS TABLE ROWS
  // ════════════════════════════════════════
  const items = order.order_items || [];

  items.forEach((item, index) => {
    const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F0F4F8';
    doc.rect(margin, y, colW, 22).fill(rowBg);

    doc.fillColor(BLACK).font('Helvetica').fontSize(9);
    doc.text(`${index + 1}`,
             col.num.x + 4,      y + 7);
    doc.text(item.product_name,
             col.product.x + 4,  y + 7, { width: col.product.w - 8 });
    doc.text(`${item.quantity}`,
             col.qty.x + 4,      y + 7);
    doc.text(`PKR ${Number(item.unit_price).toLocaleString()}`,
             col.price.x + 4,    y + 7);
    doc.text(`PKR ${Number(item.subtotal).toLocaleString()}`,
             col.subtotal.x + 4, y + 7, { width: col.subtotal.w - 8, align: 'right' });

    y += 22;
  });

  // Table bottom border
  doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor('#BDD7EE').lineWidth(1).stroke();
  y += 16;

  // ════════════════════════════════════════
  // TOTALS SECTION
  // ════════════════════════════════════════
  if (order.notes) {
    doc.fillColor(GRAY).font('Helvetica').fontSize(8)
       .text('Notes: ' + order.notes, margin, y);
    y += 18;
  }

  // Grand Total box — right aligned
  doc.rect(margin + 290, y, colW - 290, 40).fill(DARK);
  doc.fillColor('#BDD7EE').font('Helvetica').fontSize(9)
     .text('GRAND TOTAL', margin + 300, y + 8);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16)
     .text(`PKR ${Number(order.total_amount).toLocaleString()}`,
            margin + 300, y + 20, { width: colW - 310, align: 'right' });

  y += 60;

  // ════════════════════════════════════════
  // FOOTER
  // ════════════════════════════════════════
  doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor('#BDD7EE').lineWidth(1).stroke();
  y += 12;

  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(11)
     .text('Thank you for your business!', margin, y, { align: 'center', width: colW });

  doc.fillColor(GRAY).font('Helvetica').fontSize(8)
     .text('RHR & Company — Construction Materials Manufacturer — Karachi, Pakistan',
            margin, y + 18, { align: 'center', width: colW });

  doc.fillColor('#BDD7EE').fontSize(7)
     .text('System powered by DreamByte Studio — dreambyte.space',
            margin, y + 32, { align: 'center', width: colW });

  // ── Finalize PDF ──
  return await new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

module.exports = { generateInvoice };
