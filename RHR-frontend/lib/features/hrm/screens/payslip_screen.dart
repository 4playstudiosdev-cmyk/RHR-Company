import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/pdf/pdf_generator.dart';

class PayslipScreen extends StatefulWidget {
  const PayslipScreen({super.key});

  @override
  State<PayslipScreen> createState() => _PayslipScreenState();
}

class _PayslipScreenState extends State<PayslipScreen> {
  static final List<DateTime> _monthOptions =
      List.generate(6, (i) => DateTime(DateTime.now().year, DateTime.now().month - i, 1));

  late DateTime _selectedMonth = _monthOptions.first;
  bool _isLoading = true;
  String? _error;
  Map<String, dynamic>? _slip;

  static const _monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

  String _label(DateTime d) => '${_monthNames[d.month]} ${d.year}';

  double get _basic => ((_slip?['structure']?['basic_salary'] ?? 0) as num).toDouble();
  double get _allowances => ((_slip?['structure']?['allowances'] ?? 0) as num).toDouble();
  double get _otherDeductions => ((_slip?['structure']?['deductions'] ?? 0) as num).toDouble();
  double get _lateDeduction => ((_slip?['lateDeduction'] ?? 0) as num).toDouble();
  double get _gross => _basic + _allowances;
  double get _ded => _lateDeduction + _otherDeductions;
  double get _net => ((_slip?['netSalary'] ?? (_gross - _ded)) as num).toDouble();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      final userId = await SecureStorage.getUserId();
      final response = await DioClient.instance.get(
        '/api/v1/hrm/salary/$userId',
        queryParameters: {'month': _selectedMonth.month, 'year': _selectedMonth.year},
      );
      if (response.data['success'] == true) {
        setState(() => _slip = response.data['data'] as Map<String, dynamic>);
      } else {
        setState(() => _error = response.data['message'] ?? 'No salary structure found');
      }
    } catch (e) {
      setState(() => _error = 'Failed to load payslip');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _downloadPdf() async {
    final name = await SecureStorage.getFullName() ?? 'Salesman';
    generatePayslipPdf(
      employeeName: name,
      month: _label(_selectedMonth),
      earnings: {
        'Basic Salary': _basic,
        'Allowances': _allowances,
        'Gross Total': _gross,
      },
      deductions: {
        'Late Arrival': _lateDeduction,
        'Other Deductions': _otherDeductions,
        'Total Deductions': _ded,
      },
      netSalary: _net,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
          backgroundColor: AppColors.navy,
          leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white),
              onPressed: () => context.go('/salesman-dashboard')),
          title: const Text('My Payslip',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          actions: [if (_slip != null) IconButton(icon: const Icon(Icons.download_outlined, color: Colors.white),
              onPressed: _downloadPdf)]),
      body: SingleChildScrollView(padding: const EdgeInsets.all(16), child: Column(children: [
        // Month Selector
        Container(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            decoration: BoxDecoration(color: AppColors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.navy)),
            child: DropdownButton<DateTime>(
                value: _selectedMonth, isExpanded: true, underline: const SizedBox(),
                style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.bold),
                items: _monthOptions.map((m) => DropdownMenuItem(value: m, child: Text(_label(m)))).toList(),
                onChanged: (v) { if (v != null) { setState(() => _selectedMonth = v); _load(); } })),
        const SizedBox(height: 16),

        if (_isLoading)
          const Padding(padding: EdgeInsets.only(top: 60),
              child: CircularProgressIndicator(color: AppColors.orange))
        else if (_error != null)
          Padding(padding: const EdgeInsets.only(top: 60),
              child: Text(_error!, style: const TextStyle(color: AppColors.steelBlue)))
        else ...[
        // Net Pay
        StaggeredFadeIn(index: 0, scale: true, child: Container(width: double.infinity, padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(20)),
            child: Column(children: [
              const Text('Net Salary', style: TextStyle(color: Colors.white70, fontSize: 13)),
              const SizedBox(height: 8),
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: _net),
                duration: const Duration(milliseconds: 800),
                curve: Curves.easeOutCubic,
                builder: (context, value, _) => Text('PKR ${value.toStringAsFixed(0)}',
                    style: const TextStyle(color: AppColors.orange, fontSize: 32, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 4),
              Text(_label(_selectedMonth), style: const TextStyle(color: Colors.white60, fontSize: 12)),
              const SizedBox(height: 16),
              Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                _ms('Present', '${_slip?['presentDays'] ?? 0}', AppColors.success),
                _ms('Late', '${_slip?['lateDays'] ?? 0}', AppColors.orange),
              ]),
            ]))),
        const SizedBox(height: 16),
        StaggeredFadeIn(index: 1, child: _sec('Earnings', [
          _row('Basic Salary', _basic, false),
          _row('Allowances', _allowances, false),
          _tot('Gross Total', _gross),
        ])),
        const SizedBox(height: 12),
        StaggeredFadeIn(index: 2, child: _sec('Deductions', [
          _row('Late Arrival', _lateDeduction, true),
          _row('Other Deductions', _otherDeductions, true),
          _tot('Total Deductions', _ded),
        ])),
        const SizedBox(height: 12),
        StaggeredFadeIn(index: 3, child: Container(padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
                color: AppColors.orange.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.orange)),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              const Text('NET PAYABLE', style: TextStyle(
                  fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 16)),
              Text('PKR ${_net.toStringAsFixed(0)}', style: const TextStyle(
                  fontWeight: FontWeight.bold, color: AppColors.orange, fontSize: 20)),
            ]))),
        const SizedBox(height: 20),
        RHRButton(text: 'Download PDF Payslip', onPressed: _downloadPdf),
        ],
      ])),
    );
  }

  Widget _ms(String l, String v, Color c) => Column(children: [
        Text(v, style: TextStyle(color: c, fontWeight: FontWeight.bold, fontSize: 18)),
        Text(l, style: const TextStyle(color: Colors.white60, fontSize: 10)),
      ]);

  Widget _sec(String t, List<Widget> rows) => Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(14)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(t, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 15)),
        const SizedBox(height: 10), const Divider(), ...rows
      ]));

  Widget _row(String l, double a, bool d) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(l, style: const TextStyle(color: AppColors.steelBlue, fontSize: 13)),
        Text('${d ? '-' : '+'}PKR ${a.toStringAsFixed(0)}', style: TextStyle(
            color: d ? AppColors.error : AppColors.success, fontWeight: FontWeight.w500, fontSize: 13)),
      ]));

  Widget _tot(String l, double a) => Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(l, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy)),
        Text('PKR ${a.toStringAsFixed(0)}', style: const TextStyle(
            fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 14)),
      ]));
}
