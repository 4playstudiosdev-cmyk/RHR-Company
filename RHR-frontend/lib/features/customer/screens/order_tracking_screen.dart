import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/pdf/pdf_generator.dart';
import '../../../shared/router/app_transitions.dart';

class OrderTrackingScreen extends StatefulWidget {
  final String? orderId;
  const OrderTrackingScreen({super.key, this.orderId});

  @override
  State<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends State<OrderTrackingScreen> {
  Map<String, dynamic>? _order;
  bool _isLoading = true;
  num? _creditLimit;
  num _outstandingBalance = 0;
  bool _isSalesman = false;
  bool _markingUrgent = false;

  static const _steps = ['confirmed', 'preparing', 'dispatched', 'delivered'];
  static const _stepLabels = ['Order Placed', 'Preparing', 'Dispatched', 'Delivered'];

  @override
  void initState() {
    super.initState();
    if (widget.orderId != null) _loadOrder();
    _loadCreditInfo();
  }

  Future<void> _loadCreditInfo() async {
    try {
      final customerId = await SecureStorage.getUserId();
      if (customerId == null) return;
      final results = await Future.wait([
        DioClient.instance.get(ApiEndpoints.myProfile),
        DioClient.instance.get('${ApiEndpoints.ledger}$customerId'),
      ]);
      if (results[0].data['success'] == true) {
        _creditLimit = results[0].data['data']?['credit_limit'] as num?;
      }
      if (results[1].data['success'] == true) {
        _outstandingBalance = (results[1].data['data']?['currentBalance'] ?? 0) as num;
      }
      if (mounted) setState(() {});
    } catch (e) {
      debugPrint('Credit info load error: $e');
    }
  }

  Future<void> _loadOrder() async {
    try {
      final response = await DioClient.instance.get(
        '${ApiEndpoints.orders}/${widget.orderId}',
      );
      if (response.data['success'] == true) {
        final order = response.data['data'];

        final role = await SecureStorage.getRole();
        if (mounted) setState(() => _isSalesman = role == 'salesman');
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

  Future<void> _markUrgent() async {
    final orderId = _order?['id']?.toString();
    if (orderId == null) return;
    setState(() => _markingUrgent = true);
    try {
      final res = await DioClient.instance.patch(
        '${ApiEndpoints.orders}/$orderId/priority',
        data: {'priority': 'urgent'},
      );
      if (res.data['success'] == true) {
        if (mounted) {
          setState(() => _order = {...?_order, 'priority': 'urgent'});
          ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Marked urgent — admin has been notified.')));
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _markingUrgent = false);
    }
  }

  int get _currentStep {
    final status = _order?['status'] ?? '';
    final idx = _steps.indexOf(status);
    return idx == -1 ? 0 : idx;
  }

  String get _deliveredAtLabel {
    final raw = _order?['updated_at']?.toString();
    final parsed = raw == null ? null : DateTime.tryParse(raw);
    if (parsed == null) return '';
    final local = parsed.toLocal();
    final datePart = '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
    final hour12 = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final minute = local.minute.toString().padLeft(2, '0');
    final ampm = local.hour >= 12 ? 'PM' : 'AM';
    return '$datePart, $hour12:$minute $ampm';
  }

  @override
  Widget build(BuildContext context) {
    final orderId  = _order?['id']?.toString() ?? widget.orderId ?? '';
    final shortId  = orderId.length >= 8 ? orderId.substring(0, 8).toUpperCase() : orderId;
    final status   = _order?['status'] ?? '—';
    final amount   = _order?['total_amount'] ?? _order?['total'] ?? 0;
    final date     = _order?['created_at']?.toString() ?? '—';
    final items    = (_order?['order_items'] as List?) ?? [];
    final driver   = _order?['drivers'] is Map ? _order!['drivers'] as Map : null;
    final showDriver = driver != null && (status == 'dispatched' || status == 'delivered') &&
        (driver['full_name'] ?? '').toString().trim().isNotEmpty;

    return Scaffold(
      backgroundColor: AppColors.surfaceContainerLowest,
      appBar: AppBar(
        backgroundColor: AppColors.surfaceContainerLowest,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.onPrimaryFixed),
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => goBack(context, '/orders')),
        title: Text('Order Tracking', style: AppTextStyles.headlineLgMobile.copyWith(color: AppColors.onPrimaryFixed, fontSize: 20)),
        actions: [
          if (_order != null && status == 'pending')
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'Edit order',
              onPressed: () => context.push('/order-edit', extra: orderId).then((_) => _loadOrder()),
            ),
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

                      if (_isSalesman && ['confirmed', 'preparing', 'dispatched'].contains(status)) ...[
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: (_order?['priority'] == 'urgent' || _markingUrgent) ? null : _markUrgent,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.error,
                              side: const BorderSide(color: AppColors.error),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
                            ),
                            icon: Icon(_order?['priority'] == 'urgent' ? Icons.local_fire_department : Icons.local_fire_department_outlined),
                            label: Text(
                              _order?['priority'] == 'urgent'
                                  ? 'Marked Urgent — Admin Notified'
                                  : (_markingUrgent ? 'Marking...' : 'Prioritize This Order (Urgent)'),
                              style: const TextStyle(fontWeight: FontWeight.bold),
                            ),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.md),
                      ],

                      if (_creditLimit != null && _creditLimit! > 0) ...[
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(AppSpacing.md),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(AppRadius.lg),
                            border: Border.all(color: AppColors.outlineVariant),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('YOUR CREDIT LIMIT', style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant, fontSize: 11)),
                                Text('PKR ${_creditLimit!.toStringAsFixed(0)}', style: AppTextStyles.headlineSm.copyWith(color: AppColors.onPrimaryFixed)),
                              ]),
                              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                Text('AVAILABLE', style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant, fontSize: 11)),
                                Text('PKR ${(_creditLimit! - _outstandingBalance).clamp(0, _creditLimit!).toStringAsFixed(0)}',
                                    style: AppTextStyles.headlineSm.copyWith(color: AppColors.success)),
                              ]),
                            ],
                          ),
                        ),
                        const SizedBox(height: AppSpacing.md),
                      ],

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
                                            if (current && _steps[i] == 'delivered') ...[
                                              Text('Thanks for working with us! Your order has been delivered.',
                                                  style: AppTextStyles.bodySm.copyWith(color: AppColors.success, fontWeight: FontWeight.w600)),
                                              if (_deliveredAtLabel.isNotEmpty)
                                                Text(_deliveredAtLabel, style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                                            ] else if (current && _steps[i] == 'dispatched')
                                              Text('Your order is on the way!', style: AppTextStyles.bodySm.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600))
                                            else if (current)
                                              Text('In progress', style: AppTextStyles.bodySm.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
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

                      if (showDriver) ...[
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(AppSpacing.md),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(AppRadius.lg),
                            border: Border.all(color: AppColors.outlineVariant),
                          ),
                          child: Row(children: [
                            CircleAvatar(
                              radius: 24,
                              backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                              child: const Icon(Icons.local_shipping_outlined, color: AppColors.primary),
                            ),
                            const SizedBox(width: AppSpacing.base),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('Your Driver', style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant, fontSize: 11)),
                                Text(driver['full_name']?.toString() ?? 'Driver', style: AppTextStyles.headlineSm.copyWith(color: AppColors.onSurface, fontSize: 15)),
                                if ((driver['car_number'] ?? '').toString().trim().isNotEmpty)
                                  Text('Vehicle: ${driver['car_number']}', style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                              ]),
                            ),
                            if ((driver['phone'] ?? '').toString().trim().isNotEmpty)
                              IconButton(
                                icon: const Icon(Icons.phone, color: AppColors.primary),
                                onPressed: () async {
                                  final uri = Uri(scheme: 'tel', path: driver['phone'].toString());
                                  if (await canLaunchUrl(uri)) await launchUrl(uri);
                                },
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
                              final imageUrl = item['products'] is Map ? item['products']['image_url'] as String? : null;
                              return Padding(
                                padding: const EdgeInsets.symmetric(vertical: 6),
                                child: Row(children: [
                                  Container(
                                    width: 44, height: 44,
                                    decoration: BoxDecoration(color: AppColors.surfaceVariant, borderRadius: BorderRadius.circular(AppRadius.sm)),
                                    child: (imageUrl != null && imageUrl.isNotEmpty)
                                        ? ClipRRect(
                                            borderRadius: BorderRadius.circular(AppRadius.sm),
                                            child: Image.network(imageUrl, fit: BoxFit.cover,
                                                errorBuilder: (c, e, s) => const Icon(Icons.inventory_2_outlined, color: AppColors.outline, size: 20)),
                                          )
                                        : const Icon(Icons.inventory_2_outlined, color: AppColors.outline, size: 20),
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
