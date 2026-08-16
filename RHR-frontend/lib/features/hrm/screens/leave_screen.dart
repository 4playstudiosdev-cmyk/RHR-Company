import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/rhr_input_field.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';

class LeaveScreen extends StatefulWidget {
  const LeaveScreen({super.key});

  @override
  State<LeaveScreen> createState() => _LeaveScreenState();
}

class _LeaveScreenState extends State<LeaveScreen> {
  final _reasonCtrl = TextEditingController();
  String _type = 'casual';
  DateTime? _from, _to;
  bool _loading = false;
  bool _isLoadingHistory = true;

  static const _types = ['casual', 'sick', 'annual'];
  static const _typeLabels = {'casual': 'Casual', 'sick': 'Sick', 'annual': 'Annual'};

  Map<String, dynamic> _balance = {};
  List<Map<String, dynamic>> _hist = [];

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    setState(() => _isLoadingHistory = true);
    try {
      final userId = await SecureStorage.getUserId();
      final response = await DioClient.instance.get('/api/v1/hrm/leave/$userId');
      if (response.data['success'] == true) {
        final data = response.data['data'] as Map<String, dynamic>? ?? {};
        setState(() {
          _balance = Map<String, dynamic>.from(data['balance'] ?? {});
          _hist = List<Map<String, dynamic>>.from(data['requests'] ?? []);
        });
      }
    } catch (e) {
      debugPrint('Leave history error: $e');
    } finally {
      if (mounted) setState(() => _isLoadingHistory = false);
    }
  }

  Future<void> _pick(bool isFrom) async {
    final d = await showDatePicker(context: context,
        initialDate: DateTime.now(),
        firstDate: DateTime.now(),
        lastDate: DateTime.now().add(const Duration(days: 365)),
        builder: (ctx, child) => Theme(data: ThemeData.light().copyWith(
            colorScheme: const ColorScheme.light(primary: AppColors.navy)), child: child!));
    if (d != null) setState(() => isFrom ? _from = d : _to = d);
  }

  String _fmt(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    if (_from == null || _to == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Select from and to dates')));
      return;
    }
    if (_reasonCtrl.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Enter reason for leave')));
      return;
    }
    setState(() => _loading = true);
    try {
      final response = await DioClient.instance.post('/api/v1/hrm/leave/apply', data: {
        'leave_type': _type,
        'from_date': _fmt(_from!),
        'to_date': _fmt(_to!),
        'reason': _reasonCtrl.text.trim(),
      });
      if (response.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Leave application submitted!'),
              backgroundColor: AppColors.success));
          setState(() { _from = null; _to = null; _reasonCtrl.clear(); });
          _loadHistory();
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(response.data['message'] ?? 'Failed to submit leave')));
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final balEntries = _types.map((t) => MapEntry(t, (_balance[t] ?? 0) as num)).toList();
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
          backgroundColor: AppColors.navy,
          leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white),
              onPressed: () => context.go('/salesman-dashboard')),
          title: const Text('Leave Application',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold))),
      body: SingleChildScrollView(padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Leave Balance', style: TextStyle(
                fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 16)),
            const SizedBox(height: 10),
            SizedBox(height: 80, child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: balEntries.length,
                itemBuilder: (_, i) => _balanceChip(balEntries[i], i))),
            const SizedBox(height: 20),
            Container(padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(16)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(height: 4, margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(color: AppColors.orange, borderRadius: BorderRadius.circular(2))),
                  const Text('Apply for Leave', style: TextStyle(
                      fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 16)),
                  const SizedBox(height: 16),
                  const Text('Leave Type', style: TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, children: _types.map(_typeChip).toList()),
                  const SizedBox(height: 16),
                  Row(children: [
                    Expanded(child: _dateField('From Date', _from, () => _pick(true))),
                    const SizedBox(width: 10),
                    Expanded(child: _dateField('To Date', _to, () => _pick(false))),
                  ]),
                  const SizedBox(height: 16),
                  RHRInputField(label: 'Reason', hint: 'Enter reason...', controller: _reasonCtrl),
                  const SizedBox(height: 24),
                  RHRButton(text: 'Submit Application', onPressed: _submit, isLoading: _loading),
                ])),
            const SizedBox(height: 20),
            const Text('Leave History', style: TextStyle(
                fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 16)),
            const SizedBox(height: 10),
            if (_isLoadingHistory)
              const Center(child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 20),
                  child: CircularProgressIndicator(color: AppColors.orange)))
            else if (_hist.isEmpty)
              const Text('No leave history yet.', style: TextStyle(color: AppColors.steelBlue))
            else
              ..._hist.asMap().entries.map((e) => _historyRow(e.value, e.key)),
          ])),
    );
  }

  Widget _balanceChip(MapEntry<String, num> e, int index) {
    final selected = _type == e.key;
    return StaggeredFadeIn(
      index: index,
      child: TapScale(
        onTap: () => setState(() => _type = e.key),
        child: Container(
          margin: const EdgeInsets.only(right: 10),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          decoration: BoxDecoration(color: AppColors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: selected ? AppColors.orange : AppColors.disabled)),
          child: Column(children: [
            Text('${e.value}', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold,
                color: selected ? AppColors.orange : AppColors.navy)),
            Text(_typeLabels[e.key] ?? e.key, style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
          ]),
        ),
      ),
    );
  }

  Widget _typeChip(String t) {
    final selected = _type == t;
    return TapScale(
      onTap: () => setState(() => _type = t),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
            color: selected ? AppColors.orange : AppColors.warmGrey,
            borderRadius: BorderRadius.circular(20)),
        child: Text(_typeLabels[t] ?? t, style: TextStyle(
            color: selected ? Colors.white : AppColors.navy,
            fontWeight: FontWeight.w600)),
      ),
    );
  }

  Widget _dateField(String hint, DateTime? value, VoidCallback onTap) {
    return TapScale(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(border: Border.all(color: AppColors.navy),
            borderRadius: BorderRadius.circular(10)),
        child: Row(children: [
          const Icon(Icons.calendar_today, size: 16, color: AppColors.navy),
          const SizedBox(width: 8),
          Text(value != null ? '${value.day}/${value.month}' : hint,
              style: const TextStyle(color: AppColors.navy)),
        ]),
      ),
    );
  }

  Widget _historyRow(Map<String, dynamic> l, int index) {
    final status = (l['status'] ?? 'pending') as String;
    final approved = status == 'approved';
    final pending = status == 'pending';
    final color = approved ? AppColors.success : (pending ? AppColors.orange : AppColors.error);
    final from = (l['from_date'] ?? '').toString();
    final to = (l['to_date'] ?? '').toString();
    return StaggeredFadeIn(
      index: index,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          Container(width: 4, height: 48,
              color: color,
              margin: const EdgeInsets.only(right: 12)),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_typeLabels[l['leave_type']] ?? (l['leave_type'] ?? '').toString(), style: const TextStyle(
                fontWeight: FontWeight.bold, color: AppColors.navy)),
            Text('$from - $to (${l['total_days']} days)',
                style: const TextStyle(color: AppColors.steelBlue, fontSize: 12)),
          ])),
          Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20)),
              child: Text(status.toUpperCase(), style: TextStyle(
                  color: color,
                  fontSize: 10, fontWeight: FontWeight.bold))),
        ]),
      ),
    );
  }
}
