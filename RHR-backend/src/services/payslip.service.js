const PDFDocument = require('pdfkit');
const path = require('path');
const LOGO_PATH = path.join(__dirname, '../../assets/rhr-logo.jpeg');

async function generatePayslip({ employee, structure, month, year, presentDays, lateDays, earnedSalary, lateDeduction, netSalary }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end',  ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = 595, M = 50;
    const DARK_BLUE = '#1B2E6B', ORANGE = '#E8841A';
    const GRAY = '#888888', WHITE = '#FFFFFF', BLACK = '#1A1A1A';
    const LINE = '#DDDDDD', LIGHT = '#F5F5F5';

    // Header
    doc.rect(0, 0, W, 100).fill(DARK_BLUE);
    try { doc.image(LOGO_PATH, M, 15, { width: 65, height: 65 }); } catch(e){}
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(20)
       .text('RHR & COMPANY', M+78, 22);
    doc.fillColor('#BDD7EE').font('Helvetica').fontSize(8)
       .text('SALARY PAYSLIP', M+78, 48);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(28)
       .text('PAYSLIP', 360, 28, { width: 185, align: 'right' });

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // Employee info
    let y = 120;
    doc.rect(M, y, 495, 38).fill(DARK_BLUE);
    doc.fillColor('#BDD7EE').font('Helvetica').fontSize(8).text('EMPLOYEE', M+8, y+7);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(11).text(employee?.full_name || '—', M+8, y+19);
    doc.fillColor('#BDD7EE').font('Helvetica').fontSize(8).text('PERIOD', M+280, y+7);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(11).text(`${monthNames[month-1]} ${year}`, M+280, y+19);

    // Salary table
    y += 58;
    const rows = [
      ['Basic Salary',    `PKR ${Number(structure.basic_salary).toLocaleString()}`,  false],
      ['Allowances',      `PKR ${Number(structure.allowances).toLocaleString()}`,    false],
      ['Working Days',    `${structure.working_days} days`,                          false],
      ['Days Present',    `${presentDays} days`,                                     true],
      ['Days Late',       `${lateDays} days`,                                        true],
      ['Earned Salary',   `PKR ${earnedSalary.toLocaleString()}`,                    false],
      ['Late Deduction',  `- PKR ${lateDeduction.toLocaleString()}`,                 false],
      ['Other Deductions',`- PKR ${Number(structure.deductions).toLocaleString()}`,  false],
    ];

    doc.rect(M, y, 495, 22).fill(DARK_BLUE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9);
    doc.text('DESCRIPTION', M+8, y+7);
    doc.text('AMOUNT', M+350, y+7, { width: 140, align: 'right' });
    y += 22;

    rows.forEach(([label, value, shade]) => {
      doc.rect(M, y, 495, 22).fill(shade ? '#F0F4F8' : WHITE);
      doc.moveTo(M, y+22).lineTo(M+495, y+22).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.fillColor(BLACK).font('Helvetica').fontSize(9).text(label, M+8, y+7);
      doc.font('Helvetica-Bold').text(value, M+350, y+7, { width: 140, align: 'right' });
      y += 22;
    });

    // Net salary box
    y += 10;
    doc.rect(M+250, y, 245, 34).fill(DARK_BLUE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(10).text('NET SALARY', M+258, y+8);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(14)
       .text(`PKR ${netSalary.toLocaleString()}`, M+258, y+8, { width: 232, align: 'right' });

    // Footer
    doc.rect(0, 841-38, W, 38).fill(ORANGE);
    doc.fillColor(WHITE).font('Helvetica').fontSize(8)
       .text('RHR & Company | Karachi, Pakistan | 0332-2110690', M, 841-23, { width: W-M*2, align: 'center' });

    doc.end();
  });
}

module.exports = { generatePayslip };
