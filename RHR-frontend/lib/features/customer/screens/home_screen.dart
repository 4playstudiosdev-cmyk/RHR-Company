import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';
import '../../../shared/widgets/rhr_bottom_nav.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Map<String, dynamic>> _recentOrders = [];
  String _balance  = 'PKR 0';
  String _userName = 'Customer';
  bool _isLoading  = true;

  @override
  void initState() {
    super.initState();
    _loadHomeData();
  }

  Future<void> _loadHomeData() async {
    try {
      final name = await SecureStorage.getFullName();
      if (name != null && name.isNotEmpty) {
        setState(() => _userName = name);
      }

      final ordersRes = await DioClient.instance.get(
        ApiEndpoints.orders,
        queryParameters: {'limit': 5},
      );
      if (ordersRes.data['success'] == true) {
        setState(() {
          _recentOrders = List<Map<String, dynamic>>.from(
            ordersRes.data['data'] ?? []);
        });
      }

      final userId = await SecureStorage.getUserId();
      if (userId != null) {
        final ledgerRes = await DioClient.instance.get('${ApiEndpoints.ledger}$userId');
        if (ledgerRes.data['success'] == true) {
          final ledgerData = ledgerRes.data['data'] as Map<String, dynamic>? ?? {};
          final balance = (ledgerData['currentBalance'] ?? 0) as num;
          setState(() => _balance = 'PKR ${balance.toStringAsFixed(0)}');
        }
      }
    } catch (e) {
      debugPrint('Home load error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final maxOrders = screenHeight < 700 ? 3 : 5;
    final visibleOrders = _recentOrders.take(maxOrders).toList();
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          child: _isLoading
              ? const Center(
                  key: ValueKey('loading'),
                  child: CircularProgressIndicator(color: AppColors.orange))
              : SingleChildScrollView(
                key: const ValueKey('content'),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header
                    Container(
                      padding: const EdgeInsets.fromLTRB(24, 24, 24, 40),
                      decoration: const BoxDecoration(
                        color: AppColors.navy,
                        borderRadius: BorderRadius.only(
                          bottomLeft: Radius.circular(28),
                          bottomRight: Radius.circular(28),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('Good Morning!',
                                      style: TextStyle(color: Colors.white70, fontSize: 13)),
                                  Text(_userName,
                                      style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 20,
                                          fontWeight: FontWeight.bold)),
                                ],
                              ),
                              Row(
                                children: [
                                  GestureDetector(
                                    onTap: () => context.go('/notifications'),
                                    child: Container(
                                      padding: const EdgeInsets.all(8),
                                      decoration: BoxDecoration(
                                        color: Colors.white.withValues(alpha: 0.1),
                                        shape: BoxShape.circle,
                                      ),
                                      child: const Icon(Icons.notifications_outlined, color: Colors.white),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  GestureDetector(
                                    onTap: () => context.go('/profile'),
                                    child: const CircleAvatar(
                                      backgroundColor: AppColors.orange,
                                      child: Icon(Icons.person, color: Colors.white),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          const SizedBox(height: 20),
                          // Balance Card
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: Colors.white24),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('Outstanding Balance',
                                        style: TextStyle(color: Colors.white70, fontSize: 12)),
                                    Text(_balance,
                                        style: const TextStyle(
                                            color: AppColors.orange,
                                            fontSize: 42,
                                            fontWeight: FontWeight.bold)),
                                  ],
                                ),
                                GestureDetector(
                                  onTap: () => context.go('/ledger'),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                    decoration: BoxDecoration(
                                        color: AppColors.orange,
                                        borderRadius: BorderRadius.circular(8)),
                                    child: const Text('View Ledger',
                                        style: TextStyle(
                                            color: Colors.white,
                                            fontSize: 12,
                                            fontWeight: FontWeight.bold)),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Quick Actions
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 20),
                      child: Text('Quick Actions',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: AppColors.navy)),
                    ),
                    const SizedBox(height: 12),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Row(
                        children: [
                          _actionCard(context, Icons.shopping_bag_outlined, 'Browse Products', '/catalogue', AppColors.orange, 0),
                          const SizedBox(width: 12),
                          _actionCard(context, Icons.receipt_long_outlined, 'My Orders', '/orders', AppColors.navy, 1),
                          const SizedBox(width: 12),
                          _actionCard(context, Icons.account_balance_wallet_outlined, 'Ledger', '/ledger', AppColors.steelBlue, 2),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Recent Orders
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 20),
                      child: Text('Recent Orders',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: AppColors.navy)),
                    ),
                    const SizedBox(height: 12),
                    if (_recentOrders.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                        child: Text('No orders yet.',
                            style: TextStyle(color: AppColors.steelBlue, fontSize: 13)),
                      )
                    else ...[
                      ...visibleOrders.asMap().entries.map((entry) {
                        final order    = entry.value;
                        final id       = order['id']?.toString().substring(0, 8).toUpperCase() ?? '—';
                        final items    = order['order_items'];
                        final label    = items is List && items.isNotEmpty
                            ? '${items[0]['product_name'] ?? 'Item'} × ${items[0]['quantity'] ?? 1}'
                            : 'Order #$id';
                        final amount = order['total_amount'] ?? order['total'] ?? 0;
                        final status = order['status'] ?? 'Pending';
                        return _orderCard(
                          'ORD-$id',
                          label,
                          'PKR ${amount.toString()}',
                          status,
                          entry.key,
                        );
                      }),
                      const SizedBox(height: 8),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: TapScale(
                          onTap: () => context.go('/orders'),
                          child: Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: AppColors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppColors.orange),
                            ),
                            child: const Text('View All Orders →',
                                style: TextStyle(
                                    color: AppColors.orange,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13)),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                  ],
                ),
              ),
        ),
      ),
      bottomNavigationBar: const RHRBottomNav(currentIndex: 0),
    );
  }

  Widget _actionCard(BuildContext context, IconData icon, String label, String route, Color color, int index) {
    return Expanded(
      child: StaggeredFadeIn(
        index: index,
        baseDelay: const Duration(milliseconds: 100),
        child: TapScale(
        onTap: () => context.go(route),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 10,
                  offset: const Offset(0, 3))
            ],
          ),
          child: Column(
            children: [
              Icon(icon, color: color, size: 28),
              const SizedBox(height: 8),
              Text(label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.navy,
                      fontWeight: FontWeight.w600)),
            ],
          ),
        ),
        ),
      ),
    );
  }

  Widget _orderCard(String id, String items, String amount, String status, int index) {
    Color statusColor = status == 'delivered'  ? AppColors.success
        : status == 'dispatched' ? AppColors.steelBlue
        : AppColors.orange;

    return StaggeredFadeIn(
      index: index,
      child: Container(
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 8,
              offset: const Offset(0, 2))
        ],
      ),
      child: Row(
        children: [
          Container(
              width: 4,
              height: 48,
              decoration: BoxDecoration(
                  color: statusColor, borderRadius: BorderRadius.circular(2))),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(id,
                    style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: AppColors.navy,
                        fontSize: 13)),
                Text(items,
                    style: const TextStyle(
                        color: AppColors.steelBlue, fontSize: 12)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(amount,
                  style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: AppColors.orange,
                      fontSize: 13)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6)),
                child: Text(status,
                    style: TextStyle(
                        color: statusColor,
                        fontSize: 11,
                        fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        ],
      ),
      ),
    );
  }
}
