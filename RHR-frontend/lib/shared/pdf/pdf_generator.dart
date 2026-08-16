import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

const _navy = PdfColor.fromInt(0xFF1B2E6B);
const _orange = PdfColor.fromInt(0xFFE8841A);
const _steelBlue = PdfColor.fromInt(0xFF4A6FA5);
const _success = PdfColor.fromInt(0xFF27AE60);
const _error = PdfColor.fromInt(0xFFE74C3C);

pw.Widget _letterhead(String title, {String? subtitle}) {
  return pw.Container(
    width: double.infinity,
    padding: const pw.EdgeInsets.all(20),
    decoration: const pw.BoxDecoration(color: _navy),
    child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
      pw.Text('RHR & Company',
          style: pw.TextStyle(color: PdfColors.white, fontSize: 20, fontWeight: pw.FontWeight.bold)),
      pw.Text('Premium Tile Bond & Grout Manufacturer',
          style: const pw.TextStyle(color: PdfColors.white, fontSize: 9)),
      pw.SizedBox(height: 14),
      pw.Text(title,
          style: pw.TextStyle(color: _orange, fontSize: 16, fontWeight: pw.FontWeight.bold)),
      if (subtitle != null)
        pw.Text(subtitle, style: const pw.TextStyle(color: PdfColor(1, 1, 1, 0.7), fontSize: 10)),
    ]),
  );
}

pw.Widget _footer() {
  return pw.Container(
    padding: const pw.EdgeInsets.only(top: 16),
    alignment: pw.Alignment.center,
    child: pw.Text('Thank you for your business — RHR & Company',
        style: const pw.TextStyle(color: _steelBlue, fontSize: 9)),
  );
}

/// Order Tracking PDF — order number, date, status, items, total.
Future<void> generateOrderPdf({
  required String orderId,
  required String date,
  required String status,
  required List<Map<String, dynamic>> items,
  required num total,
}) async {
  final doc = pw.Document();
  doc.addPage(pw.Page(
    build: (context) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
      _letterhead('Order Receipt', subtitle: 'Order #$orderId'),
      pw.SizedBox(height: 20),
      pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
        pw.Text('Date: $date', style: const pw.TextStyle(fontSize: 11)),
        pw.Text('Status: ${status.toUpperCase()}',
            style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: _orange)),
      ]),
      pw.SizedBox(height: 16),
      pw.Table(
        border: pw.TableBorder.all(color: PdfColors.grey300),
        columnWidths: {0: const pw.FlexColumnWidth(4), 1: const pw.FlexColumnWidth(1), 2: const pw.FlexColumnWidth(2)},
        children: [
          pw.TableRow(
            decoration: const pw.BoxDecoration(color: PdfColors.grey100),
            children: [
              pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Item', style: pw.TextStyle(fontWeight: pw.FontWeight.bold))),
              pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Qty', style: pw.TextStyle(fontWeight: pw.FontWeight.bold))),
              pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Amount', style: pw.TextStyle(fontWeight: pw.FontWeight.bold))),
            ],
          ),
          ...items.map((item) => pw.TableRow(children: [
                pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('${item['name'] ?? item['product_name'] ?? 'Item'}')),
                pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('${item['qty'] ?? item['quantity'] ?? 1}')),
                pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('PKR ${item['price'] ?? item['unit_price'] ?? 0}')),
              ])),
        ],
      ),
      pw.SizedBox(height: 16),
      pw.Align(
        alignment: pw.Alignment.centerRight,
        child: pw.Text('Total: PKR $total',
            style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold, color: _navy)),
      ),
      pw.SizedBox(height: 40),
      _footer(),
    ]),
  ));
  await Printing.layoutPdf(onLayout: (format) async => doc.save());
}

/// Ledger PDF — customer name, entries table, totals.
Future<void> generateLedgerPdf({
  required String customerName,
  required String dateRange,
  required List<Map<String, dynamic>> entries,
  required num totalDebit,
  required num totalCredit,
  required num balance,
}) async {
  final doc = pw.Document();
  doc.addPage(pw.Page(
    build: (context) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
      _letterhead('Account Ledger', subtitle: '$customerName — $dateRange'),
      pw.SizedBox(height: 20),
      pw.Table(
        border: pw.TableBorder.all(color: PdfColors.grey300),
        columnWidths: {0: const pw.FlexColumnWidth(2), 1: const pw.FlexColumnWidth(3), 2: const pw.FlexColumnWidth(1.5), 3: const pw.FlexColumnWidth(1.5), 4: const pw.FlexColumnWidth(1.5)},
        children: [
          pw.TableRow(
            decoration: const pw.BoxDecoration(color: PdfColors.grey100),
            children: [
              pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Date', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
              pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Description', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
              pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Debit', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
              pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Credit', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
              pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('Balance', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10))),
            ],
          ),
          ...entries.map((e) => pw.TableRow(children: [
                pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('${e['date']}', style: const pw.TextStyle(fontSize: 9))),
                pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('${e['description']}', style: const pw.TextStyle(fontSize: 9))),
                pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('${e['debit']}', style: const pw.TextStyle(fontSize: 9, color: _error))),
                pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('${e['credit']}', style: const pw.TextStyle(fontSize: 9, color: _success))),
                pw.Padding(padding: const pw.EdgeInsets.all(6), child: pw.Text('${e['balance']}', style: const pw.TextStyle(fontSize: 9))),
              ])),
        ],
      ),
      pw.SizedBox(height: 20),
      pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceEvenly, children: [
        pw.Text('Total Debit: PKR $totalDebit', style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: _error)),
        pw.Text('Total Credit: PKR $totalCredit', style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: _success)),
        pw.Text('Balance: PKR $balance', style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: _navy)),
      ]),
      pw.SizedBox(height: 40),
      _footer(),
    ]),
  ));
  await Printing.layoutPdf(onLayout: (format) async => doc.save());
}

/// Payslip PDF — employee name, month, earnings, deductions, net salary.
Future<void> generatePayslipPdf({
  required String employeeName,
  required String month,
  required Map<String, num> earnings,
  required Map<String, num> deductions,
  required num netSalary,
}) async {
  final doc = pw.Document();

  pw.Widget rows(Map<String, num> data) => pw.Column(
        children: data.entries.map((e) => pw.Padding(
              padding: const pw.EdgeInsets.symmetric(vertical: 3),
              child: pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
                pw.Text(e.key, style: const pw.TextStyle(fontSize: 11, color: _steelBlue)),
                pw.Text('PKR ${e.value}', style: const pw.TextStyle(fontSize: 11)),
              ]),
            )).toList(),
      );

  doc.addPage(pw.Page(
    build: (context) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
      _letterhead('Payslip', subtitle: '$employeeName — $month'),
      pw.SizedBox(height: 20),
      pw.Text('Earnings', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: _navy, fontSize: 13)),
      pw.Divider(),
      rows(earnings),
      pw.SizedBox(height: 16),
      pw.Text('Deductions', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: _navy, fontSize: 13)),
      pw.Divider(),
      rows(deductions),
      pw.SizedBox(height: 24),
      pw.Container(
        padding: const pw.EdgeInsets.all(12),
        decoration: pw.BoxDecoration(color: PdfColors.grey100, borderRadius: pw.BorderRadius.circular(6)),
        child: pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
          pw.Text('NET SALARY', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: _navy, fontSize: 13)),
          pw.Text('PKR $netSalary', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: _orange, fontSize: 16)),
        ]),
      ),
      pw.SizedBox(height: 40),
      _footer(),
    ]),
  ));
  await Printing.layoutPdf(onLayout: (format) async => doc.save());
}
