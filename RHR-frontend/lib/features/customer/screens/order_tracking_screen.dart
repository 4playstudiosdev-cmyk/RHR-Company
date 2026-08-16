import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
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
        setState(() => _order = response.data['data']);
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
    final shortId  = orderId.length >= 8
        ? 'ORD-${orderId.substring(0, 8).toUpperCase()}'
        : orderId;
    final status   = _order?['status'] ?? '—';
    final amount   = _order?['total_amount'] ?? _order?['total'] ?? 0;
    final date     = _order?['created_at']?.toString() ?? '—';
    // GET /orders/:id nests items under 'order_items', not 'items'
    final items    = (_order?['order_items'] as List?) ?? [];

    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => context.go('/orders'),
        ),
        title: Text(shortId,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [
          if (_order != null)
            IconButton(
              icon: const Icon(Icons.picture_as_pdf_outlined, color: Colors.white),
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
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : _order == null
              ? const Center(
                  child: Text('Order not found.',
                      style: TextStyle(color: AppColors.steelBlue)))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Status header card
                      StaggeredFadeIn(index: 0, child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: AppColors.navy,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Order Status',
                                style: TextStyle(color: Colors.white70, fontSize: 13)),
                            const SizedBox(height: 4),
                            Text(status.toUpperCase(),
                                style: const TextStyle(
                                    color: AppColors.orange,
                                    fontSize: 22,
                                    fontWeight: FontWeight.bold)),
                            const SizedBox(height: 12),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(date.length > 10 ? date.substring(0, 10) : date,
                                    style: const TextStyle(
                                        color: Colors.white54, fontSize: 12)),
                                Text('PKR $amount',
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 16)),
                              ],
                            ),
                          ],
                        ),
                      )),
                      const SizedBox(height: 24),

                      // Progress tracker
                      if (status != 'cancelled') ...[
                        const Text('Tracking',
                            style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: AppColors.navy)),
                        const SizedBox(height: 16),
                        StaggeredFadeIn(index: 1, child: Container(
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: AppColors.white,
                            borderRadius: BorderRadius.circular(16),
                            boxShadow: [
                              BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.05),
                                  blurRadius: 8,
                                  offset: const Offset(0, 2))
                            ],
                          ),
                          child: Column(
                            children: List.generate(_steps.length, (i) {
                              final done    = i <= _currentStep;
                              final current = i == _currentStep;
                              final isLast  = i == _steps.length - 1;
                              return Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Column(
                                    children: [
                                      Container(
                                        width: 28,
                                        height: 28,
                                        decoration: BoxDecoration(
                                          color: done ? AppColors.orange : AppColors.warmGrey,
                                          shape: BoxShape.circle,
                                          border: current
                                              ? Border.all(color: AppColors.orange, width: 2)
                                              : null,
                                        ),
                                        child: Icon(
                                          done ? Icons.check : Icons.circle_outlined,
                                          size: 16,
                                          color: done ? Colors.white : AppColors.disabled,
                                        ),
                                      ),
                                      if (!isLast)
                                        Container(
                                          width: 2,
                                          height: 36,
                                          color: done ? AppColors.orange : AppColors.warmGrey,
                                        ),
                                    ],
                                  ),
                                  const SizedBox(width: 16),
                                  Padding(
                                    padding: const EdgeInsets.only(top: 4),
                                    child: Text(
                                      _steps[i][0].toUpperCase() + _steps[i].substring(1),
                                      style: TextStyle(
                                        color: done ? AppColors.navy : AppColors.disabled,
                                        fontWeight: current
                                            ? FontWeight.bold
                                            : FontWeight.normal,
                                        fontSize: 14,
                                      ),
                                    ),
                                  ),
                                ],
                              );
                            }),
                          ),
                        )),
                        const SizedBox(height: 24),
                      ],

                      // Items list
                      const Text('Order Items',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: AppColors.navy)),
                      const SizedBox(height: 12),
                      if (items.isEmpty)
                        const Text('No items.',
                            style: TextStyle(color: AppColors.steelBlue))
                      else
                        ...items.asMap().entries.map((entry) {
                          final item  = entry.value;
                          final name  = item['product_name'] ?? item['name'] ?? 'Item';
                          final qty   = item['quantity'] ?? item['qty'] ?? 1;
                          final price = item['unit_price'] ?? item['price'] ?? 0;
                          return StaggeredFadeIn(
                            index: entry.key,
                            child: Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: AppColors.white,
                              borderRadius: BorderRadius.circular(12),
                              boxShadow: [
                                BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.04),
                                    blurRadius: 6,
                                    offset: const Offset(0, 2))
                              ],
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(name,
                                          style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              color: AppColors.navy,
                                              fontSize: 13)),
                                      Text('Qty: $qty',
                                          style: const TextStyle(
                                              color: AppColors.steelBlue,
                                              fontSize: 12)),
                                    ],
                                  ),
                                ),
                                Text('PKR $price',
                                    style: const TextStyle(
                                        color: AppColors.orange,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13)),
                              ],
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
