import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';
import '../../../shared/router/app_transitions.dart';

/// Every delivered order across this salesman's customers — reachable
/// from the dashboard's "My Orders" header and the sidebar drawer.
class SalesmanDeliveredOrdersScreen extends StatefulWidget {
  const SalesmanDeliveredOrdersScreen({super.key});

  @override
  State<SalesmanDeliveredOrdersScreen> createState() => _SalesmanDeliveredOrdersScreenState();
}

class _SalesmanDeliveredOrdersScreenState extends State<SalesmanDeliveredOrdersScreen> {
  List<Map<String, dynamic>> _orders = [];
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
      final res = await DioClient.instance.get(ApiEndpoints.orders);
      if (res.data['success'] == true) {
        final all = List<Map<String, dynamic>>.from(res.data['data'] ?? []);
        setState(() => _orders = all.where((o) => (o['status'] ?? '') == 'delivered').toList());
      }
    } catch (e) {
      debugPrint('Delivered orders load error: $e');
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
        title: const Text('Delivered Orders', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : RefreshIndicator(
              color: AppColors.orange,
              onRefresh: _load,
              child: _orders.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        Padding(
                          padding: EdgeInsets.only(top: 120),
                          child: Column(children: [
                            Icon(Icons.local_shipping_outlined, size: 56, color: AppColors.steelBlue),
                            SizedBox(height: 12),
                            Center(child: Text('No delivered orders yet.', style: TextStyle(color: AppColors.steelBlue))),
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
                        final orderNumber = (order['order_number'] ?? order['id'] ?? '').toString();
                        final customerName = order['users']?['full_name'] ?? 'Customer';
                        final amount = _asNum(order['total_amount']);
                        final date = (order['created_at'] ?? '').toString();
                        final shortDate = date.length >= 10 ? date.substring(0, 10) : date;

                        return StaggeredFadeIn(
                          index: i,
                          child: TapScale(
                            onTap: () => context.push('/order-tracking', extra: order['id']?.toString()),
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
                                  decoration: BoxDecoration(color: AppColors.success.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                                  child: const Icon(Icons.local_shipping_outlined, color: AppColors.success, size: 20),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Text(orderNumber, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 13)),
                                    const SizedBox(height: 2),
                                    Text('$customerName · $shortDate', style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
                                  ]),
                                ),
                                Text('PKR ${amount.toStringAsFixed(0)}',
                                    style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 13)),
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
