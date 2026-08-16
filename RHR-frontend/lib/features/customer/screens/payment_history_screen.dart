import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/staggered_fade_in.dart';

class PaymentHistoryScreen extends StatefulWidget {
  const PaymentHistoryScreen({super.key});

  @override
  State<PaymentHistoryScreen> createState() => _PaymentHistoryScreenState();
}

class _PaymentHistoryScreenState extends State<PaymentHistoryScreen> {
  List<Map<String, dynamic>> _payments = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _isLoading = true);
    try {
      final myId = await SecureStorage.getUserId();
      final response = await DioClient.instance.get('/api/v1/payments');
      if (response.data['success'] == true) {
        final all = List<Map<String, dynamic>>.from(response.data['data'] ?? []);
        setState(() {
          // Backend scopes payments by company for non-salesman roles, so
          // filter down to this customer's own payments client-side.
          _payments = all.where((p) => p['customer_id'] == myId).toList();
        });
      }
    } catch (e) {
      debugPrint('Payment history error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = _payments.fold<num>(0, (s, p) => s + ((p['amount'] ?? 0) as num));
    final approvedTotal = _payments
        .where((p) => p['status'] == 'approved')
        .fold<num>(0, (s, p) => s + ((p['amount'] ?? 0) as num));
    final pendingTotal = total - approvedTotal;
    final approvedCount = _payments.where((p) => p['status'] == 'approved').length;

    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => context.go('/home')),
        title: const Text('Payment Statement',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : _payments.isEmpty
          ? const Center(child: Text('No payments recorded yet.',
              style: TextStyle(color: AppColors.steelBlue)))
          : SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Letterhead
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
                color: AppColors.navy, borderRadius: BorderRadius.circular(20)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('RHR & Company', style: TextStyle(
                      color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                ]),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8)),
                  child: Text('${_payments.length} entries',
                      style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ]),
              const SizedBox(height: 18),
              const Text('Total Paid', style: TextStyle(color: Colors.white70, fontSize: 12)),
              const SizedBox(height: 4),
              Text('PKR $total', style: const TextStyle(
                  color: AppColors.orange, fontSize: 30, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(child: _summaryChip('Confirmed', 'PKR $approvedTotal', AppColors.success)),
                const SizedBox(width: 10),
                Expanded(child: _summaryChip('Pending', 'PKR $pendingTotal', AppColors.orange)),
                const SizedBox(width: 10),
                Expanded(child: _summaryChip('Approved', '$approvedCount/${_payments.length}', Colors.white)),
              ]),
            ]),
          ),
          const SizedBox(height: 20),

          // Statement sheet
          Container(
            width: double.infinity,
            decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)]),
            child: Column(children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 10),
                child: Row(children: [
                  Expanded(flex: 3, child: Text('DATE / REF', style: _headerStyle)),
                  Expanded(flex: 4, child: Text('DETAILS', style: _headerStyle)),
                  Expanded(flex: 2, child: Text('AMOUNT', textAlign: TextAlign.right, style: _headerStyle)),
                ]),
              ),
              const Divider(height: 1, indent: 18, endIndent: 18),
              ...List.generate(_payments.length, (i) {
                final p = _payments[i];
                final isApproved = p['status'] == 'approved';
                final statusColor = isApproved ? AppColors.success : AppColors.orange;
                final date = (p['created_at'] ?? '').toString();
                final shortDate = date.length >= 10 ? date.substring(0, 10) : date;
                final ref = (p['id'] ?? '').toString();
                final shortRef = ref.length >= 8 ? ref.substring(0, 8).toUpperCase() : ref;
                final method = ((p['method'] ?? '') as String).replaceAll('_', ' ');
                return StaggeredFadeIn(index: i, child: Container(
                  padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
                  decoration: BoxDecoration(
                    border: Border(left: BorderSide(color: statusColor, width: 3)),
                    color: i.isOdd ? AppColors.warmGrey.withValues(alpha: 0.35) : Colors.transparent,
                  ),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(
                      flex: 3,
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(shortDate, style: const TextStyle(
                            color: AppColors.navy, fontSize: 13, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 2),
                        Text(shortRef, style: const TextStyle(
                            color: AppColors.steelBlue, fontSize: 11)),
                      ]),
                    ),
                    Expanded(
                      flex: 4,
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(method.isEmpty ? '—' : method, style: const TextStyle(
                            color: AppColors.navy, fontSize: 13)),
                      ]),
                    ),
                    Expanded(
                      flex: 2,
                      child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text('PKR ${p['amount']}', style: const TextStyle(
                            fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 14)),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                              color: statusColor.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(20)),
                          child: Text((p['status'] ?? '').toString().toUpperCase(),
                              style: TextStyle(color: statusColor, fontSize: 9, fontWeight: FontWeight.bold)),
                        ),
                      ]),
                    ),
                  ]),
                ));
              }),
              Container(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
                decoration: const BoxDecoration(
                    border: Border(top: BorderSide(color: AppColors.navy, width: 1.5))),
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  const Text('TOTAL PAID', style: TextStyle(
                      fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 13)),
                  Text('PKR $total', style: const TextStyle(
                      fontWeight: FontWeight.bold, color: AppColors.orange, fontSize: 18)),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 20),
        ]),
      ),
    );
  }

  static const _headerStyle = TextStyle(
      color: AppColors.steelBlue, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.5);

  Widget _summaryChip(String label, String value, Color color) => Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
      decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.white24)),
      child: Column(children: [
        Text(value, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 13),
            textAlign: TextAlign.center),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(color: Colors.white60, fontSize: 10)),
      ]));
}
