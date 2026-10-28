import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/premium_ui.dart';
import '../../../shared/router/app_transitions.dart';
import '../../../shared/customer_display.dart';

class SalesmanOrdersScreen extends StatefulWidget {
  final String title;
  final Set<String>? statusFilter;
  final IconData emptyIcon;
  final String emptyText;
  const SalesmanOrdersScreen({
    super.key,
    required this.title,
    this.statusFilter,
    this.emptyIcon = Icons.receipt_long_outlined,
    this.emptyText = 'No orders yet.',
  });

  @override
  State<SalesmanOrdersScreen> createState() => _SalesmanOrdersScreenState();
}

class _SalesmanOrdersScreenState extends State<SalesmanOrdersScreen> {
  List<Map<String, dynamic>> _orders = [];
  bool _loading = true;

  static const _statusColors = <String, Color>{
    'pending':     Color(0xFF1565C0),
    'confirmed':   kNavy,
    'preparing':   kAmber,
    'dispatched':  kAmber,
    'delivered':   kGreen,
    'undelivered': kRed,
    'cancelled':   kRed,
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  num _asNum(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '0') ?? 0;

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await DioClient.instance.get(ApiEndpoints.orders);
      if (res.data['success'] == true) {
        final all = List<Map<String, dynamic>>.from(res.data['data'] ?? []);
        setState(() => _orders = widget.statusFilter == null
            ? all
            : all.where((o) => widget.statusFilter!.contains((o['status'] ?? '').toString())).toList());
      }
    } catch (e) {
      debugPrint('Orders load error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalAmt = _orders.fold<num>(0, (s, o) => s + _asNum(o['total_amount']));
    return Scaffold(
      backgroundColor: kCardBg,
      appBar: premiumAppBar(
        widget.title,
        subtitle: '${_orders.length} orders',
        onBack: () => goBack(context, '/salesman-dashboard'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: kNavy))
          : RefreshIndicator(
              color: kGreen,
              onRefresh: _load,
              child: _orders.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [PremiumEmpty(icon: widget.emptyIcon, title: widget.emptyText)],
                    )
                  : ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.only(top: 12, bottom: 20),
                      itemCount: _orders.length + 1,
                      itemBuilder: (context, i) {
                        if (i == 0) {
                          return Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                            child: PremiumSummaryCard(
                              label: 'Total Value',
                              value: 'PKR ${totalAmt.toStringAsFixed(0)}',
                              sublabel: '${_orders.length} orders',
                              icon: Icons.receipt_long_outlined,
                            ),
                          );
                        }
                        final order = _orders[i - 1];
                        final status = (order['status'] ?? 'pending').toString();
                        final color = _statusColors[status] ?? kNavy;
                        final orderNumber = (order['order_number'] ?? order['id'] ?? '').toString();
                        final customerName = customerTitle(order['users'] as Map?);
                        final amount = _asNum(order['total_amount']);
                        final date = (order['created_at'] ?? '').toString();
                        final shortDate = date.length >= 10 ? date.substring(0, 10) : date;

                        return StaggeredFadeIn(
                          index: i,
                          child: PremiumCard(
                            onTap: () => context.push('/order-tracking', extra: order['id']?.toString()).then((_) => _load()),
                            child: Row(children: [
                              Container(
                                width: 44, height: 44,
                                decoration: BoxDecoration(
                                    color: color.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
                                child: Icon(Icons.receipt_long_outlined, color: color, size: 22),
                              ),
                              const SizedBox(width: 12),
                              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(orderNumber,
                                    style: const TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 13)),
                                const SizedBox(height: 2),
                                Text('$customerName · $shortDate',
                                    style: const TextStyle(color: kTextMuted, fontSize: 11)),
                              ])),
                              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                Text('PKR ${amount.toStringAsFixed(0)}',
                                    style: const TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 13)),
                                const SizedBox(height: 4),
                                StatusBadge(status, color),
                              ]),
                            ]),
                          ),
                        );
                      },
                    ),
            ),
    );
  }
}
