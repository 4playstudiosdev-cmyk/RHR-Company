import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
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
  int _totalOrders = 0;
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
        final orders = List<Map<String, dynamic>>.from(ordersRes.data['data'] ?? []);
        setState(() {
          _recentOrders = orders;
          _totalOrders = orders.length;
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
      backgroundColor: AppColors.background,
      body: SafeArea(
        bottom: false,
        child: _isLoading
            ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
            : SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Wave header
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(
                          AppSpacing.marginMobile, AppSpacing.md, AppSpacing.marginMobile, 56),
                      decoration: const BoxDecoration(color: AppColors.primary),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('RHR & Company',
                                  style: AppTextStyles.headlineMd.copyWith(color: Colors.white)),
                              Row(children: [
                                GestureDetector(
                                  onTap: () => context.go('/notifications'),
                                  child: const Icon(Icons.notifications, color: Colors.white, size: 26),
                                ),
                                const SizedBox(width: 14),
                                GestureDetector(
                                  onTap: () => context.go('/profile'),
                                  child: const CircleAvatar(
                                    radius: 16,
                                    backgroundColor: AppColors.tertiaryFixedDim,
                                    child: Icon(Icons.person, color: Colors.white, size: 18),
                                  ),
                                ),
                              ]),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.base),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(AppRadius.full),
                              border: Border.all(color: Colors.white24),
                            ),
                            child: Text('My Account',
                                style: AppTextStyles.labelMd.copyWith(color: Colors.white)),
                          ),
                          const SizedBox(height: AppSpacing.base),
                          Text('Welcome back, $_userName 👋',
                              style: AppTextStyles.headlineLgMobile.copyWith(color: Colors.white)),
                        ],
                      ),
                    ),

                    // Stats row (overlapping the wave)
                    Transform.translate(
                      offset: const Offset(0, -36),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.marginMobile),
                        child: Column(children: [
                          Row(children: [
                            Expanded(child: _StatCard(label: 'Outstanding', value: _balance, color: AppColors.error)),
                            const SizedBox(width: AppSpacing.base),
                            Expanded(child: _StatCard(label: 'Total Orders', value: '$_totalOrders', color: AppColors.primary)),
                          ]),
                          const SizedBox(height: AppSpacing.base),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: () => context.go('/catalogue'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.secondaryContainer,
                                foregroundColor: AppColors.onSecondaryContainer,
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
                                elevation: 0,
                              ),
                              icon: const Icon(Icons.shopping_bag),
                              label: Text('Browse Products', style: AppTextStyles.labelMd.copyWith(color: AppColors.onSecondaryContainer)),
                            ),
                          ),
                          const SizedBox(height: AppSpacing.md),

                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('My Recent Orders', style: AppTextStyles.headlineSm.copyWith(color: AppColors.onBackground)),
                              GestureDetector(
                                onTap: () => context.go('/orders'),
                                child: Text('View All', style: AppTextStyles.labelMd.copyWith(color: AppColors.primary)),
                              ),
                            ],
                          ),
                          const Divider(color: AppColors.outlineVariant),
                          const SizedBox(height: AppSpacing.base),

                          if (_recentOrders.isEmpty)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              child: Text('No orders yet.', style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                            )
                          else
                            ...visibleOrders.map((order) {
                              final id = order['id']?.toString().substring(0, 8).toUpperCase() ?? '—';
                              final amount = order['total_amount'] ?? order['total'] ?? 0;
                              final status = (order['status'] ?? 'pending').toString();
                              return _OrderRow(id: 'ORD-$id', amount: 'PKR $amount', status: status,
                                  onTap: () => context.go('/order-tracking', extra: order['id']?.toString()));
                            }),
                          const SizedBox(height: AppSpacing.lg),
                        ]),
                      ),
                    ),
                  ],
                ),
              ),
      ),
      bottomNavigationBar: const RHRBottomNav(currentIndex: 0),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _StatCard({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.outlineVariant),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
        const SizedBox(height: 4),
        Text(value, style: AppTextStyles.headlineSm.copyWith(color: color)),
      ]),
    );
  }
}

class _OrderRow extends StatelessWidget {
  final String id;
  final String amount;
  final String status;
  final VoidCallback onTap;
  const _OrderRow({required this.id, required this.amount, required this.status, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final statusColor = status == 'delivered'
        ? AppColors.success
        : status == 'dispatched'
            ? AppColors.onPrimaryFixedVariant
            : AppColors.onSecondaryFixedVariant;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: AppSpacing.sm),
        padding: const EdgeInsets.all(AppSpacing.sm),
        decoration: BoxDecoration(
          color: AppColors.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: AppColors.outlineVariant),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(id, style: AppTextStyles.labelMd.copyWith(color: AppColors.onBackground)),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(amount, style: AppTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600, color: AppColors.onBackground)),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(AppRadius.full)),
                child: Text(status.toUpperCase(), style: TextStyle(color: statusColor, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}
