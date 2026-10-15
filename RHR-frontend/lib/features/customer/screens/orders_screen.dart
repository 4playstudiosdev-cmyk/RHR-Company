import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/rhr_bottom_nav.dart';
import '../../../shared/widgets/shimmer_box.dart';

class OrdersScreen extends StatefulWidget {
  /// When set (e.g. 'delivered'), only orders with this status show —
  /// used by the "Delivered Orders" shortcut from the home screen and
  /// profile menu, reusing this same list/card UI instead of a
  /// duplicate screen.
  final String? statusFilter;
  const OrdersScreen({super.key, this.statusFilter});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<Map<String, dynamic>> _orders = [];
  bool _isLoading = true;

  List<Map<String, dynamic>> get _displayOrders => widget.statusFilter == null
      ? _orders
      : _orders.where((o) => (o['status'] ?? '') == widget.statusFilter).toList();

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
      case 'dispatched': return AppColors.onPrimaryFixedVariant;
      case 'preparing':  return AppColors.onTertiaryFixedVariant;
      case 'confirmed':  return AppColors.primary;
      case 'cancelled':  return AppColors.error;
      default:           return AppColors.outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: widget.statusFilter != null
          ? AppBar(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              title: const Text('Delivered Orders'),
            )
          : null,
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          if (widget.statusFilter == null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.marginMobile, AppSpacing.base, AppSpacing.marginMobile, AppSpacing.base),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('My Orders', style: AppTextStyles.headlineLgMobile.copyWith(color: AppColors.onSurface)),
                  IconButton(onPressed: _loadOrders, icon: const Icon(Icons.refresh, color: AppColors.primary)),
                ],
              ),
            ),
          Expanded(
            child: _isLoading
                ? ListView.builder(
                    padding: const EdgeInsets.all(AppSpacing.marginMobile),
                    itemCount: 5,
                    itemBuilder: (_, i) => const ShimmerListRow(),
                  )
                : _displayOrders.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(widget.statusFilter == 'delivered' ? Icons.local_shipping_outlined : Icons.receipt_long_outlined,
                                size: 64, color: AppColors.outlineVariant),
                            const SizedBox(height: AppSpacing.base),
                            Text(widget.statusFilter == 'delivered' ? 'No delivered orders yet' : 'No orders yet',
                                style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurfaceVariant)),
                            const SizedBox(height: AppSpacing.xs),
                            TextButton(
                              onPressed: () => context.push('/catalogue'),
                              child: Text('Start Shopping', style: AppTextStyles.labelMd.copyWith(color: AppColors.primary)),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(AppSpacing.marginMobile, 0, AppSpacing.marginMobile, AppSpacing.marginMobile),
                        itemCount: _displayOrders.length,
                        itemBuilder: (_, i) {
                          final order       = _displayOrders[i];
                          final status      = order['status'] ?? 'pending';
                          final statusColor = _statusColor(status);
                          final total       = order['total_amount'] ?? order['total'] ?? 0;
                          final date        = order['created_at'] ?? '';
                          final shortDate   = date.length > 10 ? date.substring(0, 10) : date;
                          final orderId     = order['id']?.toString() ?? '';

                          return GestureDetector(
                            onTap: () => context.push('/order-tracking', extra: orderId),
                            child: Container(
                              margin: const EdgeInsets.only(bottom: AppSpacing.base),
                              padding: const EdgeInsets.all(AppSpacing.sm),
                              decoration: BoxDecoration(
                                color: AppColors.surfaceContainerLowest,
                                borderRadius: BorderRadius.circular(AppRadius.lg),
                                border: Border(
                                  top: BorderSide(color: AppColors.outlineVariant),
                                  right: BorderSide(color: AppColors.outlineVariant),
                                  bottom: BorderSide(color: AppColors.outlineVariant),
                                  left: BorderSide(color: AppColors.primary, width: 4),
                                ),
                                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))],
                              ),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                      Text('Order #${orderId.isNotEmpty ? orderId.substring(0, 8).toUpperCase() : 'N/A'}',
                                          style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
                                      Text(shortDate, style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurface)),
                                    ]),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(6)),
                                      child: Text(status.toUpperCase(), style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w700)),
                                    ),
                                  ],
                                ),
                                const Padding(
                                  padding: EdgeInsets.symmetric(vertical: AppSpacing.sm),
                                  child: Divider(color: AppColors.outlineVariant, height: 1),
                                ),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                      Text('Total Amount', style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                                      Text('PKR $total', style: AppTextStyles.headlineSm.copyWith(color: AppColors.primary)),
                                    ]),
                                    Row(children: [
                                      if (status == 'pending') ...[
                                        OutlinedButton(
                                          onPressed: () => context.push('/order-edit', extra: orderId),
                                          style: OutlinedButton.styleFrom(
                                            foregroundColor: AppColors.onTertiaryFixedVariant,
                                            side: BorderSide(color: AppColors.onTertiaryFixedVariant),
                                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                                          ),
                                          child: Text('Edit', style: AppTextStyles.labelMd.copyWith(color: AppColors.onTertiaryFixedVariant)),
                                        ),
                                        const SizedBox(width: 8),
                                      ],
                                      OutlinedButton(
                                        onPressed: () => context.push('/order-tracking', extra: orderId),
                                        style: OutlinedButton.styleFrom(
                                          foregroundColor: AppColors.primary,
                                          side: const BorderSide(color: AppColors.primary),
                                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                                        ),
                                        child: Text('Track', style: AppTextStyles.labelMd.copyWith(color: AppColors.primary)),
                                      ),
                                    ]),
                                  ],
                                ),
                              ]),
                            ),
                          );
                        },
                      ),
          ),
        ]),
      ),
      bottomNavigationBar: widget.statusFilter == null ? const RHRBottomNav(currentIndex: 2) : null,
    );
  }
}
