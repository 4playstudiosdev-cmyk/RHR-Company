import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/pdf/pdf_generator.dart';

class LedgerScreen extends StatefulWidget {
  const LedgerScreen({super.key});

  @override
  State<LedgerScreen> createState() => _LedgerScreenState();
}

class _LedgerScreenState extends State<LedgerScreen> {
  List<Map<String, dynamic>> _entries = [];
  num _currentBalance = 0;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadLedger();
  }

  Future<void> _loadLedger() async {
    setState(() => _isLoading = true);
    try {
      final customerId = await SecureStorage.getUserId();
      if (customerId == null) return;
      final response = await DioClient.instance.get(
        '${ApiEndpoints.ledger}$customerId',
      );
      if (response.data['success'] == true) {
        final data = response.data['data'] as Map<String, dynamic>? ?? {};
        setState(() {
          _entries = List<Map<String, dynamic>>.from(data['entries'] ?? []);
          _currentBalance = (data['currentBalance'] ?? 0) as num;
        });
      }
    } catch (e) {
      debugPrint('Ledger error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  String _shortDate(String date) => date.length >= 10 ? date.substring(0, 10) : date;

  Future<void> _downloadPdf() async {
    final name = await SecureStorage.getFullName() ?? 'Customer';
    final pdfEntries = _entries.map((e) => {
      'date': _shortDate((e['created_at'] ?? '').toString()),
      'description': e['description'] ?? '',
      'debit': e['entry_type'] == 'debit' ? e['amount'] : 0,
      'credit': e['entry_type'] == 'credit' ? e['amount'] : 0,
      'balance': e['running_balance'] ?? 0,
    }).toList();
    final totalD = pdfEntries.fold(0.0, (s, e) => s + ((e['debit'] ?? 0) as num));
    final totalC = pdfEntries.fold(0.0, (s, e) => s + ((e['credit'] ?? 0) as num));
    generateLedgerPdf(
      customerName: name,
      dateRange: 'All time',
      entries: pdfEntries,
      totalDebit: totalD,
      totalCredit: totalC,
      balance: _currentBalance,
    );
  }

  @override
  Widget build(BuildContext context) {
    final totalD = _entries
        .where((e) => e['entry_type'] == 'debit')
        .fold(0.0, (s, e) => s + ((e['amount'] ?? 0) as num));
    final totalC = _entries
        .where((e) => e['entry_type'] == 'credit')
        .fold(0.0, (s, e) => s + ((e['amount'] ?? 0) as num));
    final maxY = _entries.fold(0.0, (m, e) {
          final v = ((e['amount'] ?? 0) as num).toDouble();
          return v > m ? v : m;
        }) *
        1.2;

    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => context.go('/home')),
        title: const Text('My Ledger',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [IconButton(
            icon: const Icon(Icons.picture_as_pdf_outlined, color: Colors.white),
            onPressed: _entries.isEmpty ? null : _downloadPdf)],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : Column(children: [
        Container(color: AppColors.navy,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            child: Row(children: [
              Expanded(child: StaggeredFadeIn(index: 0,
                  child: _card('Outstanding', 'PKR ${_currentBalance.toStringAsFixed(0)}', AppColors.orange))),
              const SizedBox(width: 10),
              Expanded(child: StaggeredFadeIn(index: 1,
                  child: _card('Total Debit', 'PKR ${totalD.toStringAsFixed(0)}', AppColors.error))),
              const SizedBox(width: 10),
              Expanded(child: StaggeredFadeIn(index: 2,
                  child: _card('Total Credit', 'PKR ${totalC.toStringAsFixed(0)}', AppColors.success))),
            ])),
        Expanded(child: _entries.isEmpty
            ? const Center(
                child: Text('No ledger entries yet.',
                    style: TextStyle(color: AppColors.steelBlue)))
            : SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              ..._entries.asMap().entries.map((mapEntry) {
                final i = mapEntry.key;
                final e = mapEntry.value;
                final isD = e['entry_type'] == 'debit';
                final bcolor = isD ? AppColors.error : AppColors.success;
                final amount = (e['amount'] ?? 0) as num;
                final date = _shortDate((e['created_at'] ?? '').toString());
                return StaggeredFadeIn(index: i, child: Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                      color: AppColors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border(left: BorderSide(color: bcolor, width: 4)),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)]),
                  child: Row(children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(e['description'] as String? ?? '', style: const TextStyle(
                          fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 14)),
                      const SizedBox(height: 4),
                      Text(date, style: const TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                    ])),
                    Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text(isD ? '-PKR $amount' : '+PKR $amount',
                          style: TextStyle(color: bcolor, fontWeight: FontWeight.bold, fontSize: 18)),
                      const SizedBox(height: 4),
                      Text('Bal: PKR ${e['running_balance'] ?? 0}',
                          style: const TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                    ]),
                  ]),
                ));
              }),
              const SizedBox(height: 20),

              // Debit vs Credit chart
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                    color: AppColors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)]),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Debit vs Credit', style: TextStyle(
                      fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 15)),
                  const SizedBox(height: 16),
                  SizedBox(height: 200, child: BarChart(BarChartData(
                      alignment: BarChartAlignment.spaceAround,
                      maxY: maxY <= 0 ? 1000 : maxY,
                      barTouchData: BarTouchData(enabled: true),
                      titlesData: FlTitlesData(
                          bottomTitles: AxisTitles(sideTitles: SideTitles(
                              showTitles: true,
                              getTitlesWidget: (v, m) {
                                final idx = v.toInt();
                                if (idx < 0 || idx >= _entries.length) return const SizedBox();
                                return Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Text(_shortDate((_entries[idx]['created_at'] ?? '').toString()),
                                      style: const TextStyle(color: AppColors.steelBlue, fontSize: 9)),
                                );
                              })),
                          leftTitles: AxisTitles(sideTitles: SideTitles(
                              showTitles: true, reservedSize: 40,
                              getTitlesWidget: (v, m) => Text('${(v / 1000).toStringAsFixed(0)}K',
                                  style: const TextStyle(color: AppColors.steelBlue, fontSize: 9)))),
                          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false))),
                      borderData: FlBorderData(show: false),
                      gridData: const FlGridData(show: false),
                      barGroups: _entries.asMap().entries.map((mapEntry) {
                        final i = mapEntry.key;
                        final e = mapEntry.value;
                        final isD = e['entry_type'] == 'debit';
                        final value = ((e['amount'] ?? 0) as num).toDouble();
                        final color = isD ? AppColors.error : AppColors.success;
                        return BarChartGroupData(x: i, barRods: [
                          BarChartRodData(toY: value, color: color, width: 18,
                              borderRadius: const BorderRadius.vertical(top: Radius.circular(4)))
                        ]);
                      }).toList()))),
                  const SizedBox(height: 12),
                  Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Container(width: 12, height: 12, decoration: const BoxDecoration(color: AppColors.error, shape: BoxShape.circle)),
                    const SizedBox(width: 6),
                    const Text('Debit', style: TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                    const SizedBox(width: 20),
                    Container(width: 12, height: 12, decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle)),
                    const SizedBox(width: 6),
                    const Text('Credit', style: TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                  ]),
                ]),
              ),
              const SizedBox(height: 16),
            ]))),
      ]),
    );
  }

  Widget _card(String label, String value, Color color) =>
      Container(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
          decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white30)),
          child: Column(children: [
            Text(value,
                textAlign: TextAlign.center,
                style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 16),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
            const SizedBox(height: 6),
            Text(label,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 12)),
          ]));
}
