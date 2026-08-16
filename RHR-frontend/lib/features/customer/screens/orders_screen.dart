import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';
import '../../../shared/widgets/shimmer_box.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<Map<String, dynamic>> _orders = [];
  bool _isLoading = true;

  @override
  void initState() { super.initState(); _loadOrders(); }

  Future<void> _loadOrders() async {
    setState(() => _isLoading = true);
    try {
      final response = await DioClient.instance.get(ApiEndpoints.orders);
      debugPrint('Orders: ${response.statusCode} | ${response.data}');
      if (response.data['success'] == true) {
        final data = response.data['data'];
        setState(() {
          _orders = data is List
              ? List<Map<String, dynamic>>.from(data) : [];
        });
      }
    } catch (e) { debugPrint('Orders error: $e'); }
    finally { if (mounted) setState(() => _isLoading = false); }
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'delivered':  return AppColors.success;
      case 'dispatched': return AppColors.steelBlue;
      case 'preparing':  return AppColors.orange;
      case 'confirmed':  return AppColors.navy;
      case 'cancelled':  return AppColors.error;
      default:           return AppColors.disabled;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => context.go('/home'),
        ),
        title: const Text('My Orders', style: TextStyle(
            color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _loadOrders,
          ),
        ],
      ),
      body: _isLoading
          ? ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: 5,
              itemBuilder: (_, i) => const ShimmerListRow(),
            )
          : _orders.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.receipt_long_outlined,
                          size: 64, color: AppColors.disabled),
                      const SizedBox(height: 16),
                      const Text('No orders yet', style: TextStyle(
                          color: AppColors.steelBlue, fontSize: 16)),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () => context.go('/catalogue'),
                        child: const Text('Start Shopping',
                            style: TextStyle(color: AppColors.orange)),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _orders.length,
                  itemBuilder: (_, i) {
                    final order       = _orders[i];
                    final status      = order['status'] ?? 'pending';
                    final statusColor = _statusColor(status);
                    final total       = order['total_amount'] ?? order['total'] ?? 0;
                    final date        = order['created_at'] ?? '';
                    final shortDate   =
                        date.length > 10 ? date.substring(0, 10) : date;

                    return StaggeredFadeIn(
                      index: i,
                      child: TapScale(
                      onTap: () => context.go('/order-tracking',
                          extra: order['id']),
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                            color: AppColors.white,
                            borderRadius: BorderRadius.circular(16),
                            boxShadow: [BoxShadow(
                                color: Colors.black.withValues(alpha: 0.05),
                                blurRadius: 8, offset: const Offset(0, 2))]),
                        child: Column(children: [
                          Container(
                            height: 4,
                            decoration: BoxDecoration(
                                color: statusColor,
                                borderRadius: const BorderRadius.vertical(
                                    top: Radius.circular(16))),
                          ),
                          Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Order #${order['id']?.toString().substring(0, 8) ?? 'N/A'}',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.bold,
                                          color: AppColors.navy, fontSize: 14),
                                    ),
                                    Text(shortDate, style: const TextStyle(
                                        color: AppColors.steelBlue,
                                        fontSize: 12)),
                                  ],
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text('PKR $total', style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        color: AppColors.orange, fontSize: 15)),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                          color: statusColor.withValues(
                                              alpha: 0.1),
                                          borderRadius:
                                              BorderRadius.circular(20)),
                                      child: Text(status.toUpperCase(),
                                          style: TextStyle(
                                              color: statusColor,
                                              fontWeight: FontWeight.bold,
                                              fontSize: 11)),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ]),
                      ),
                      ),
                    );
                  },
                ),
    );
  }
}
