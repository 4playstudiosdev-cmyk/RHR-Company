import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/router/app_transitions.dart';

/// Every cash/bank-transfer collection this salesman has taken from a
/// customer (dashboard's "Payments Collected" stat) — not what they've
/// since deposited to the company, which is a separate number shown in
/// Cash Collection. Each row also shows that customer's current
/// outstanding, so it's clear how much of their balance this payment
/// actually cleared.
class SalesmanPaymentsCollectedScreen extends StatefulWidget {
  const SalesmanPaymentsCollectedScreen({super.key});

  @override
  State<SalesmanPaymentsCollectedScreen> createState() => _SalesmanPaymentsCollectedScreenState();
}

class _SalesmanPaymentsCollectedScreenState extends State<SalesmanPaymentsCollectedScreen> {
  List<Map<String, dynamic>> _entries = [];
  Map<String, num> _outstandingByCustomer = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  num _asNum(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '0') ?? 0;

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        DioClient.instance.get(ApiEndpoints.recoveryTransactionsMe),
        DioClient.instance.get(ApiEndpoints.recoveryBankTransfersMe),
        DioClient.instance.get(ApiEndpoints.customers),
      ]);
      final entries = <Map<String, dynamic>>[];
      for (final res in [results[0], results[1]]) {
        if (res.data['success'] == true) {
          entries.addAll(List<Map<String, dynamic>>.from(res.data['data'] ?? [])
              .where((e) => (e['status'] ?? '') == 'approved'));
        }
      }
      entries.sort((a, b) => (b['created_at'] ?? '').toString().compareTo((a['created_at'] ?? '').toString()));

      final outstanding = <String, num>{};
      if (results[2].data['success'] == true) {
        for (final c in List<Map<String, dynamic>>.from(results[2].data['data'] ?? [])) {
          outstanding[c['id'] as String] = _asNum(c['outstanding_balance']);
        }
      }

      setState(() {
        _entries = entries;
        _outstandingByCustomer = outstanding;
      });
    } catch (e) {
      debugPrint('Payments collected load error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  num get _total => _entries.fold<num>(0, (s, e) => s + _asNum(e['amount']));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: () => goBack(context, '/salesman-dashboard')),
        title: const Text('Payments Collected', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : RefreshIndicator(
              color: AppColors.orange,
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(16)),
                    child: Column(children: [
                      const Text('Total Collected', style: TextStyle(color: Colors.white70, fontSize: 13)),
                      const SizedBox(height: 6),
                      Text('PKR ${_total.toStringAsFixed(0)}',
                          style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
                    ]),
                  ),
                  const SizedBox(height: 16),
                  if (_entries.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 60),
                      child: Center(child: Text('No payments collected yet.', style: TextStyle(color: AppColors.steelBlue))),
                    )
                  else
                    ..._entries.asMap().entries.map((entry) {
                      final i = entry.key;
                      final e = entry.value;
                      final customer = e['users'] as Map<String, dynamic>?;
                      final customerId = e['customer_id'] as String?;
                      final amount = _asNum(e['amount']);
                      final isBank = (e['payment_type'] ?? '') == 'bank';
                      final date = (e['recovery_date'] ?? '').toString();
                      final remaining = customerId != null ? _outstandingByCustomer[customerId] : null;

                      return StaggeredFadeIn(
                        index: i,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: AppColors.white,
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
                          ),
                          child: Row(children: [
                            Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                  color: (isBank ? AppColors.navy : AppColors.success).withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(10)),
                              child: Icon(isBank ? Icons.account_balance_outlined : Icons.payments_outlined,
                                  color: isBank ? AppColors.navy : AppColors.success, size: 20),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(customer?['full_name'] ?? 'Customer',
                                    style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 14)),
                                Text('$date · ${isBank ? 'Bank Transfer' : 'Cash'}',
                                    style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
                                if (remaining != null)
                                  Text('Remaining balance: PKR ${remaining.toStringAsFixed(0)}',
                                      style: TextStyle(color: remaining > 0 ? AppColors.error : AppColors.success, fontSize: 11)),
                              ]),
                            ),
                            Text('PKR ${amount.toStringAsFixed(0)}',
                                style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.success, fontSize: 14)),
                          ]),
                        ),
                      );
                    }),
                ],
              ),
            ),
    );
  }
}
