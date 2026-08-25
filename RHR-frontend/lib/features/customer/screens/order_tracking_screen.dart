import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/pdf/pdf_generator.dart';

class OrderTrackingScreen extends StatefulWidget {
  final String? orderId;
  const OrderTrackingScreen({super.key, this.orderId});

  @override
  State<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends State<OrderTrackingScreen> {
  Map<String, dynamic>? _order;
  bool _isLoading = true;

  static const _steps = ['confirmed', 'preparing', 'dispatched', 'delivered'];
  static const _stepLabels = ['Order Placed', 'Preparing', 'Dispatched', 'Delivered'];

  @override
  void initState() {
    super.initState();
    if (widget.orderId != null) _loadOrder();
  }

  Future<void> _loadOrder() async {
    try {
      final response = await DioClient.instance.get(
        '${ApiEndpoints.orders}/${widget.orderId}',
      );
      if (response.data['success'] == true) {
        final order = response.data['data'];

        final role = await SecureStorage.getRole();
        if (role == 'customer') {
          final myId = await SecureStorage.getUserId();
          if (myId != null && order?['customer_id'] != null && order['customer_id'] != myId) {
            if (mounted) {
              ScaffoldMessenger.of(context)
                  .showSnackBar(const SnackBar(content: Text('Access denied')));
              context.pop();
            }
            return;
          }
        }

        setState(() => _order = order);
      }
    } catch (e) {
      debugPrint('Order tracking error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  int get _currentStep {
    final status = _order?['status'] ?? '';
    final idx = _steps.indexOf(status);
    return idx == -1 ? 0 : idx;
  }

  @override
  Widget build(BuildContext context) {
    final orderId  = _order?['id']?.toString() ?? widget.orderId ?? '';
    final shortId  = orderId.length >= 8 ? orderId.substring(0, 8).toUpperCase() : orderId;
    final status   = _order?['status'] ?? '—';
    final amount   = _order?['total_amount'] ?? _order?['total'] ?? 0;
    final date     = _order?['created_at']?.toString() ?? '—';
    final items    = (_order?['order_items'] as List?) ?? [];

    return Scaffold(
      backgroundColor: AppColors.surfaceContainerLowest,
      appBar: AppBar(
        backgroundColor: AppColors.surfaceContainerLowest,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.onPrimaryFixed),
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => context.go('/orders')),
        title: Text('Order Tracking', style: AppTextStyles.headlineLgMobile.copyWith(color: AppColors.onPrimaryFixed, fontSize: 20)),
        actions: [
          if (_order != null)
            IconButton(
              icon: const Icon(Icons.download),
              onPressed: () => generateOrderPdf(
                orderId: shortId,
                date: date.length > 10 ? date.substring(0, 10) : date,
                status: status,
                items: items.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
                total: (amount is num) ? amount : num.tryParse(amount.toString()) ?? 0,
              ),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : _order == null
              ? Center(child: Text('Order not found.', style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurfaceVariant)))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(AppSpacing.marginMobile),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Info card
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(AppSpacing.md),
                        decoration: BoxDecoration(color: AppColors.onPrimaryFixed, borderRadius: BorderRadius.circular(AppRadius.lg)),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('ORDER ID', style: AppTextStyles.labelMd.copyWith(color: Colors.white70, fontSize: 11)),
                                Text('#ORD-$shortId', style: AppTextStyles.headlineSm.copyWith(color: Colors.white)),
                              ]),
                              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                Text('TOTAL AMOUNT', style: AppTextStyles.labelMd.copyWith(color: Colors.white70, fontSize: 11)),
                                Text('PKR $amount', style: AppTextStyles.headlineSm.copyWith(color: Colors.white)),
                              ]),
                            ],
                          ),
                          const Padding(padding: EdgeInsets.symmetric(vertical: AppSpacing.sm), child: Divider(color: Colors.white24, height: 1)),
                          Row(children: [
                            const Icon(Icons.calendar_today, size: 14, color: Colors.white70),
                            const SizedBox(width: 6),
                            Text(date.length > 10 ? 'Placed: ${date.substring(0, 10)}' : date,
                                style: AppTextStyles.bodySm.copyWith(color: Colors.white)),
                          ]),
                        ]),
                      ),
                      const SizedBox(height: AppSpacing.md),

                      // Tracking stepper
                      if (status != 'cancelled') ...[
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(AppSpacing.md),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(AppRadius.lg),
                            border: Border.all(color: AppColors.outlineVariant),
                          ),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Padding(
                              padding: const EdgeInsets.only(bottom: AppSpacing.base),
                              child: Text('Tracking Status', style: AppTextStyles.headlineSm.copyWith(color: AppColors.onPrimaryFixed)),
                            ),
                            const Divider(color: AppColors.outlineVariant, height: 1),
                            const SizedBox(height: AppSpacing.base),
                            Column(
                              children: List.generate(_steps.length, (i) {
                                final done    = i <= _currentStep;
                                final current = i == _currentStep;
                                final isLast  = i == _steps.length - 1;
                                return IntrinsicHeight(
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.stretch,
                                    children: [
                                      Column(children: [
                                        Container(
                                          width: 16, height: 16,
                                          decoration: BoxDecoration(
                                            color: current ? AppColors.primary : (done ? AppColors.success : AppColors.surfaceVariant),
                                            shape: BoxShape.circle,
                                            border: Border.all(color: Colors.white, width: 2),
                                          ),
                                        ),
                                        if (!isLast)
                                          Expanded(child: Container(width: 2, color: done && !current ? AppColors.success : AppColors.outlineVariant)),
                                      ]),
                                      const SizedBox(width: AppSpacing.sm),
                                      Expanded(
                                        child: Padding(
                                          padding: const EdgeInsets.only(bottom: AppSpacing.md),
                                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                            Text(_stepLabels[i], style: AppTextStyles.headlineSm.copyWith(
                                                color: done ? AppColors.onSurface : AppColors.outline, fontSize: 15)),
                                            if (current)
                                              Text('Your order is on the way!', style: AppTextStyles.bodySm.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
                                          ]),
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              }),
                            ),
                          ]),
                        ),
                        const SizedBox(height: AppSpacing.md),
                      ],

                      // Items card
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(AppSpacing.md),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(AppRadius.lg),
                          border: Border.all(color: AppColors.outlineVariant),
                        ),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Order Items (${items.length})', style: AppTextStyles.headlineSm.copyWith(color: AppColors.onPrimaryFixed)),
                          const Padding(padding: EdgeInsets.symmetric(vertical: AppSpacing.base), child: Divider(color: AppColors.outlineVariant, height: 1)),
                          if (items.isEmpty)
                            Text('No items.', style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurfaceVariant))
                          else
                            ...items.map((item) {
                              final name  = item['product_name'] ?? item['name'] ?? 'Item';
                              final qty   = item['quantity'] ?? item['qty'] ?? 1;
                              final price = item['unit_price'] ?? item['price'] ?? 0;
                              return Padding(
                                padding: const EdgeInsets.symmetric(vertical: 6),
                                child: Row(children: [
                                  Container(
                                    width: 44, height: 44,
                                    decoration: BoxDecoration(color: AppColors.surfaceVariant, borderRadius: BorderRadius.circular(AppRadius.sm)),
                                    child: const Icon(Icons.inventory_2_outlined, color: AppColors.outline, size: 20),
                                  ),
                                  const SizedBox(width: AppSpacing.sm),
                                  Expanded(
                                    child: Text('$name x $qty', style: AppTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600, color: AppColors.onSurface)),
                                  ),
                                  Text('PKR $price', style: AppTextStyles.labelMd.copyWith(color: AppColors.primary)),
                                ]),
                              );
                            }),
                        ]),
                      ),
                    ],
                  ),
                ),
    );
  }
}
