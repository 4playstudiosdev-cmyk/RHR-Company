import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/router/app_transitions.dart';

/// Lets a customer adjust quantities (or drop a line entirely) on their
/// own order while it's still 'pending' — the window before an admin
/// confirms it (see orders.controller.js's customerUpdateOrderItems,
/// which 403s once status moves past 'pending'). No price/add-product
/// flow here on purpose — keeping this to quantity/remove only is
/// enough to cover "I ordered the wrong amount" without re-building the
/// whole catalogue-picking flow a fresh order already has.
class OrderEditScreen extends StatefulWidget {
  final String? orderId;
  const OrderEditScreen({super.key, this.orderId});

  @override
  State<OrderEditScreen> createState() => _OrderEditScreenState();
}

class _OrderEditScreenState extends State<OrderEditScreen> {
  bool _loading = true;
  bool _saving = false;
  List<Map<String, dynamic>> _items = [];
  final Map<String, int> _quantities = {};
  final Set<String> _removedIds = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await DioClient.instance.get('${ApiEndpoints.orders}/${widget.orderId}');
      if (res.data['success'] == true) {
        final order = res.data['data'];
        if (order['status'] != 'pending') {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('This order can no longer be edited.')));
            context.pop();
          }
          return;
        }
        _items = List<Map<String, dynamic>>.from(order['order_items'] ?? []);
        for (final item in _items) {
          _quantities[item['id'].toString()] = (item['quantity'] as num).toInt();
        }
      }
    } catch (e) {
      debugPrint('Order edit load error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  num get _total {
    num sum = 0;
    for (final item in _items) {
      final id = item['id'].toString();
      if (_removedIds.contains(id)) continue;
      final qty = _quantities[id] ?? 0;
      sum += qty * (item['unit_price'] as num);
    }
    return sum;
  }

  int get _remainingCount => _items.where((i) => !_removedIds.contains(i['id'].toString())).length;

  Future<void> _save() async {
    if (_remainingCount == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('An order needs at least one item.')));
      return;
    }
    setState(() => _saving = true);
    try {
      final itemUpdates = _items
          .where((i) => !_removedIds.contains(i['id'].toString()))
          .map((i) => {'item_id': i['id'], 'quantity': _quantities[i['id'].toString()]})
          .toList();
      final res = await DioClient.instance.patch(
        '${ApiEndpoints.orders}/${widget.orderId}/customer-items',
        data: {
          'items': itemUpdates,
          'removed_ids': _removedIds.toList(),
        },
      );
      if (res.data['success'] == true) {
        if (mounted) await showSuccessCheck(context, message: 'Order Updated!');
        if (mounted) context.pop();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res.data['message'] ?? 'Failed')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surfaceContainerLowest,
      appBar: AppBar(
        backgroundColor: AppColors.surfaceContainerLowest,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.onPrimaryFixed),
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => goBack(context, '/orders')),
        title: Text('Edit Order', style: AppTextStyles.headlineLgMobile.copyWith(color: AppColors.onPrimaryFixed, fontSize: 20)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.marginMobile),
              children: [
                for (final item in _items)
                  if (!_removedIds.contains(item['id'].toString()))
                    Container(
                      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                      padding: const EdgeInsets.all(AppSpacing.md),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(AppRadius.lg),
                        border: Border.all(color: AppColors.outlineVariant),
                      ),
                      child: Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(item['product_name'] ?? '', style: AppTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600)),
                            Text('PKR ${item['unit_price']} / unit', style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                          ]),
                        ),
                        IconButton(
                          icon: const Icon(Icons.remove_circle_outline),
                          onPressed: (_quantities[item['id'].toString()] ?? 1) > 1
                              ? () => setState(() => _quantities[item['id'].toString()] = (_quantities[item['id'].toString()] ?? 1) - 1)
                              : null,
                        ),
                        Text('${_quantities[item['id'].toString()] ?? 1}', style: AppTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w700)),
                        IconButton(
                          icon: const Icon(Icons.add_circle_outline),
                          onPressed: () => setState(() => _quantities[item['id'].toString()] = (_quantities[item['id'].toString()] ?? 1) + 1),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline, color: AppColors.error),
                          onPressed: () => setState(() => _removedIds.add(item['id'].toString())),
                        ),
                      ]),
                    ),
                const SizedBox(height: AppSpacing.md),
                Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(color: AppColors.onPrimaryFixed, borderRadius: BorderRadius.circular(AppRadius.lg)),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('New Total', style: AppTextStyles.bodyMd.copyWith(color: Colors.white70)),
                      Text('PKR ${_total.toStringAsFixed(0)}', style: AppTextStyles.headlineSm.copyWith(color: Colors.white)),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _saving ? null : _save,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                    ),
                    child: _saving
                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : Text('Save Changes', style: AppTextStyles.labelMd.copyWith(color: Colors.white, fontSize: 15)),
                  ),
                ),
              ],
            ),
    );
  }
}
