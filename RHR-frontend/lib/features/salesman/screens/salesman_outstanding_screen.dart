import 'package:flutter/material.dart';
import '../../../shared/customer_display.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/premium_ui.dart';
import '../../../shared/router/app_transitions.dart';

class SalesmanOutstandingScreen extends StatefulWidget {
  const SalesmanOutstandingScreen({super.key});

  @override
  State<SalesmanOutstandingScreen> createState() => _SalesmanOutstandingScreenState();
}

class _SalesmanOutstandingScreenState extends State<SalesmanOutstandingScreen> {
  List<Map<String, dynamic>> _customers = [];
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
      final res = await DioClient.instance.get(ApiEndpoints.customers);
      if (res.data['success'] == true) {
        final list = List<Map<String, dynamic>>.from(res.data['data'] ?? []);
        list.sort((a, b) => _asNum(b['outstanding_balance']).compareTo(_asNum(a['outstanding_balance'])));
        setState(() => _customers = list);
      }
    } catch (e) {
      debugPrint('Outstanding load error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  num get _totalOutstanding => _customers.fold<num>(0, (s, c) => s + _asNum(c['outstanding_balance']));

  @override
  Widget build(BuildContext context) {
    final withBalance = _customers.where((c) => _asNum(c['outstanding_balance']) > 0).length;
    return Scaffold(
      backgroundColor: kCardBg,
      appBar: premiumAppBar(
        'Outstanding Balances',
        subtitle: '$withBalance customers with balance',
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
                    label: 'Total Outstanding',
                    value: 'PKR ${_totalOutstanding.toStringAsFixed(0)}',
                    sublabel: 'Across all customers · highest first',
                    icon: Icons.account_balance_wallet_outlined,
                    valueColor: _totalOutstanding > 0 ? const Color(0xFFFF6B6B) : kGreen,
                  ),
                  const SizedBox(height: 16),
                  if (_customers.isEmpty)
                    const PremiumEmpty(icon: Icons.people_outline, title: 'No customers yet')
                  else
                    ..._customers.asMap().entries.map((entry) {
                      final i = entry.key;
                      final c = entry.value;
                      final outstanding = _asNum(c['outstanding_balance']);
                      final creditLimit = c['credit_limit'];
                      final title = customerTitle(c, fallback: '');
                      final initials = title.isNotEmpty ? title[0].toUpperCase() : '?';

                      return StaggeredFadeIn(
                        index: i,
                        child: PremiumCard(
                          onTap: () => context.push('/customer-detail', extra: c['id'] as String),
                          borderColor: outstanding > 0 ? kRed.withValues(alpha: 0.25) : null,
                          child: Row(children: [
                            CircleAvatar(
                              radius: 22,
                              backgroundColor: outstanding > 0
                                  ? kRed.withValues(alpha: 0.08)
                                  : kNavy.withValues(alpha: 0.07),
                              child: Text(initials,
                                  style: TextStyle(
                                      color: outstanding > 0 ? kRed : kNavy,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 15)),
                            ),
                            const SizedBox(width: 12),
                            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(title,
                                  style: const TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 13)),
                              if ((c['phone'] ?? '').isNotEmpty)
                                Text(c['phone'].toString(),
                                    style: const TextStyle(color: kTextMuted, fontSize: 11)),
                            ])),
                            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                              Text('PKR ${outstanding.toStringAsFixed(0)}',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 14,
                                      color: outstanding > 0 ? kRed : kGreen)),
                              if (creditLimit != null) ...[
                                const SizedBox(height: 2),
                                Text('Limit: PKR ${_asNum(creditLimit).toStringAsFixed(0)}',
                                    style: const TextStyle(color: kTextMuted, fontSize: 10)),
                              ],
                            ]),
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
