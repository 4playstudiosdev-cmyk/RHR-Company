import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';
import '../../../shared/router/app_transitions.dart';

/// Every order across this salesman's customers, optionally narrowed to
/// a set of statuses — one reusable screen backs "All Orders" (Orders
/// Today stat), "Delivered Orders", and "Cancelled Orders" rather than
/// three near-identical ones.
class SalesmanOrdersScreen extends StatefulWidget {
  final String title;
  final Set<String>? statusFilter; // null = every status
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

  static const _statusColors = {
    'pending': AppColors.steelBlue,
    'confirmed': AppColors.navy,
    'preparing': AppColors.orange,
    'dispatched': AppColors.orange,
    'delivered': AppColors.success,
    'undelivered': AppColors.error,
    'cancelled': AppColors.error,
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
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: () => goBack(context, '/salesman-dashboard')),
        title: Text(widget.title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : RefreshIndicator(
              color: AppColors.orange,
              onRefresh: _load,
              child: _orders.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        Padding(
                          padding: const EdgeInsets.only(top: 120),
                          child: Column(children: [
                            Icon(widget.emptyIcon, size: 56, color: AppColors.steelBlue),
                            const SizedBox(height: 12),
                            Center(child: Text(widget.emptyText, style: const TextStyle(color: AppColors.steelBlue))),
                          ]),
                        ),
                      ],
                    )
                  : ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      itemCount: _orders.length,
                      itemBuilder: (context, i) {
                        final order = _orders[i];
                        final status = (order['status'] ?? 'pending').toString();
                        final color = _statusColors[status] ?? AppColors.steelBlue;
                        final orderNumber = (order['order_number'] ?? order['id'] ?? '').toString();
                        final customerName = order['users']?['full_name'] ?? 'Customer';
                        final amount = _asNum(order['total_amount']);
                        final date = (order['created_at'] ?? '').toString();
                        final shortDate = date.length >= 10 ? date.substring(0, 10) : date;

                        return StaggeredFadeIn(
                          index: i,
                          child: TapScale(
                            onTap: () => context.push('/order-tracking', extra: order['id']?.toString())
                                .then((_) => _load()),
                            child: Container(
                              margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
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
                                  decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                                  child: Icon(Icons.receipt_long_outlined, color: color, size: 20),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Text(orderNumber, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 13)),
                                    const SizedBox(height: 2),
                                    Text('$customerName · $shortDate', style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
                                  ]),
                                ),
                                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                  Text('PKR ${amount.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 13)),
                                  const SizedBox(height: 4),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                    decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                                    child: Text(status.toUpperCase(), style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.bold)),
                                  ),
                                ]),
                              ]),
                            ),
                          ),
                        );
                      },
                    ),
            ),
    );
  }
}
