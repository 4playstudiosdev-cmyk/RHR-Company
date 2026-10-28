import 'package:flutter/material.dart';
import '../../../shared/customer_display.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/premium_ui.dart';
import '../../../shared/router/app_transitions.dart';

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
        DioClient.instance.get(ApiEndpoints.customers),
      ]);
      final entries = <Map<String, dynamic>>[];
      if (results[0].data['success'] == true) {
        entries.addAll(List<Map<String, dynamic>>.from(results[0].data['data'] ?? [])
            .where((e) => (e['status'] ?? '') == 'approved'));
      }
      entries.sort((a, b) => (b['created_at'] ?? '').toString().compareTo((a['created_at'] ?? '').toString()));

      final outstanding = <String, num>{};
      if (results[1].data['success'] == true) {
        for (final c in List<Map<String, dynamic>>.from(results[1].data['data'] ?? [])) {
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
      backgroundColor: kCardBg,
      appBar: premiumAppBar(
        'Payments Collected',
        subtitle: '${_entries.length} records',
        onBack: () => goBack(context, '/salesman-dashboard'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: kNavy))
          : RefreshIndicator(
              color: kGreen,
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  PremiumSummaryCard(
                    label: 'Total Collected',
                    value: 'PKR ${_total.toStringAsFixed(0)}',
                    sublabel: '${_entries.length} payments approved',
                    icon: Icons.payments_outlined,
                  ),
                  const SizedBox(height: 16),
                  if (_entries.isEmpty)
                    const PremiumEmpty(icon: Icons.payments_outlined, title: 'No payments collected yet')
                  else
                    ..._entries.asMap().entries.map((entry) {
                      final i = entry.key;
                      final e = entry.value;
                      final customer   = e['users'] as Map<String, dynamic>?;
                      final customerId = e['customer_id'] as String?;
                      final amount     = _asNum(e['amount']);
                      final isBank     = (e['payment_type'] ?? '') == 'bank';
                      final isCheque   = (e['payment_type'] ?? '') == 'cheque';
                      final date       = (e['recovery_date'] ?? '').toString();
                      final remaining  = customerId != null ? _outstandingByCustomer[customerId] : null;
                      final typeLabel  = isBank ? 'Bank Transfer' : isCheque ? 'Cheque' : 'Cash';
                      final typeColor  = isBank ? const Color(0xFF1565C0) : isCheque ? kAmber : kGreen;
                      final typeIcon   = isBank ? Icons.account_balance_outlined : isCheque ? Icons.assignment_outlined : Icons.payments_outlined;

                      return StaggeredFadeIn(
                        index: i,
                        child: PremiumCard(
                          child: Row(children: [
                            Container(
                              width: 44, height: 44,
                              decoration: BoxDecoration(
                                  color: typeColor.withValues(alpha: 0.10),
                                  borderRadius: BorderRadius.circular(12)),
                              child: Icon(typeIcon, color: typeColor, size: 22),
                            ),
                            const SizedBox(width: 12),
                            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(customerTitle(customer),
                                  style: const TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 14)),
                              const SizedBox(height: 2),
                              Row(children: [
                                StatusBadge(typeLabel, typeColor),
                                const SizedBox(width: 6),
                                Text(date, style: const TextStyle(color: kTextMuted, fontSize: 11)),
                              ]),
                              if (remaining != null) ...[
                                const SizedBox(height: 3),
                                Text('Balance: PKR ${remaining.toStringAsFixed(0)}',
                                    style: TextStyle(
                                        color: remaining > 0 ? kRed : kGreen,
                                        fontSize: 11, fontWeight: FontWeight.w600)),
                              ],
                            ])),
                            Text('PKR ${amount.toStringAsFixed(0)}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800, color: kGreen, fontSize: 14)),
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
