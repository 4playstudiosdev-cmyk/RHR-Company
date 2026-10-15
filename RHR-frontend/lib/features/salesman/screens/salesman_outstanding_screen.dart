import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';
import '../../../shared/router/app_transitions.dart';

/// Every one of this salesman's customers, sorted by outstanding
/// balance (highest first) — for prioritizing who to collect from next.
/// Reachable from the dashboard's "My Customers" header and the sidebar
/// drawer.
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
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: () => goBack(context, '/salesman-dashboard')),
        title: const Text('Outstanding Balances', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
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
                      const Text('Total Outstanding — All Customers', style: TextStyle(color: Colors.white70, fontSize: 13)),
                      const SizedBox(height: 6),
                      Text('PKR ${_totalOutstanding.toStringAsFixed(0)}',
                          style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
                    ]),
                  ),
                  const SizedBox(height: 16),
                  if (_customers.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 60),
                      child: Center(child: Text('No customers yet.', style: TextStyle(color: AppColors.steelBlue))),
                    )
                  else
                    ..._customers.asMap().entries.map((entry) {
                      final i = entry.key;
                      final c = entry.value;
                      final outstanding = _asNum(c['outstanding_balance']);
                      final creditLimit = c['credit_limit'];
                      return StaggeredFadeIn(
                        index: i,
                        child: TapScale(
                          onTap: () => context.push('/customer-detail', extra: c['id'] as String),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: AppColors.white,
                              borderRadius: BorderRadius.circular(14),
                              border: outstanding > 0 ? Border.all(color: AppColors.error.withValues(alpha: 0.3)) : null,
                              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
                            ),
                            child: Row(children: [
                              CircleAvatar(
                                backgroundColor: AppColors.navy,
                                child: Text((c['full_name'] ?? '?').toString().isNotEmpty ? c['full_name'][0].toUpperCase() : '?',
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(c['full_name'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 14)),
                                  Text(c['phone'] ?? '', style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
                                ]),
                              ),
                              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                Text('PKR ${outstanding.toStringAsFixed(0)}',
                                    style: TextStyle(
                                        fontWeight: FontWeight.bold, fontSize: 14,
                                        color: outstanding > 0 ? AppColors.error : AppColors.success)),
                                if (creditLimit != null)
                                  Text('Limit: PKR ${_asNum(creditLimit).toStringAsFixed(0)}',
                                      style: const TextStyle(color: AppColors.steelBlue, fontSize: 10)),
                              ]),
                            ]),
                          ),
                        ),
                      );
                    }),
                ],
              ),
            ),
    );
  }
}
