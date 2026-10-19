import 'package:flutter/material.dart';
import '../../../shared/widgets/order_in_line_dialog.dart';
import '../../../shared/order_qty_rules.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/cart_store.dart';
import '../../../shared/router/app_transitions.dart';

class OrderPlacementScreen extends StatefulWidget {
  final List<Map<String, dynamic>>? cartItems;
  const OrderPlacementScreen({super.key, this.cartItems});

  @override
  State<OrderPlacementScreen> createState() => _OrderPlacementScreenState();
}

class _OrderPlacementScreenState extends State<OrderPlacementScreen> {
  bool _isLoading = false;
  // Delivery address starts as the shop address (and GPS pin) the customer
  // saved in their profile — it used to be a hardcoded Saddar address for
  // everyone. They can still edit the text for this one order.
  final _addressController = TextEditingController();
  final _notesController = TextEditingController();
  bool _loadingProfile = true;
  double? _shopLat;
  double? _shopLng;

  @override
  void initState() {
    super.initState();
    _loadProfileAddress();
  }

  Future<void> _loadProfileAddress() async {
    try {
      final res = await DioClient.instance.get(ApiEndpoints.myProfile);
      if (res.data['success'] == true) {
        final d = res.data['data'] as Map<String, dynamic>? ?? {};
        final address = (d['shop_address'] ?? '').toString().trim();
        if (!mounted) return;
        setState(() {
          if (_addressController.text.trim().isEmpty && address.isNotEmpty) {
            _addressController.text = address;
          }
          final lat = d['shop_latitude'];
          final lng = d['shop_longitude'];
          if (lat is num && lng is num) {
            _shopLat = lat.toDouble();
            _shopLng = lng.toDouble();
          }
        });
      }
    } catch (e) {
      debugPrint('Profile address load error: $e');
    } finally {
      if (mounted) setState(() => _loadingProfile = false);
    }
  }

  Future<void> _openShopOnMap() async {
    if (_shopLat == null || _shopLng == null) return;
    final uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$_shopLat,$_shopLng');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  List<Map<String, dynamic>> get _displayItems => widget.cartItems ?? [];

  num get _total => _displayItems.fold<num>(
      0, (sum, i) => sum + (i['price'] as num) * (i['qty'] as num));

  @override
  void dispose() {
    _addressController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _placeOrder() async {
    if (_displayItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Your cart is empty — add a product first')));
      return;
    }
    final minHint = minTotalQtyHint(_displayItems.fold<int>(0, (s, i) => s + (i['qty'] as int)));
    if (minHint != null) {
      _showOrderRejected(minHint);
      return;
    }
    setState(() => _isLoading = true);
    try {
      final items = _displayItems.map((item) => {
        'product_id': item['id'],
        'quantity':   item['qty'],
      }).toList();

      final response = await DioClient.instance.post(
        ApiEndpoints.orders,
        data: {
          'items':            items,
          'notes':            _notesController.text.trim().isEmpty ? 'Mobile app order' : _notesController.text.trim(),
          'delivery_address': _addressController.text.trim().isEmpty ? 'Karachi' : _addressController.text.trim(),
        },
      );

      debugPrint('Place order: ${response.statusCode} | ${response.data}');

      if (response.data['success'] == true) {
        final orderId = response.data['data']['id'] as String;
        CartStore.instance.clear();
        if (mounted) {
          await showSuccessCheck(context, message: 'Order Placed!');
          if (mounted) {
            // .go() alone would leave Order Success as the only entry on
            // the stack (it replaces the whole stack, not just this
            // screen) — then the Android back button has nothing left to
            // pop to and exits the app instead of navigating anywhere.
            // Resetting to home first, then pushing Order Success on top
            // of it, means back correctly returns to Home (and skips
            // the now-stale, already-cleared checkout form underneath).
            context.go('/home');
            context.push('/order-success', extra: {
              'orderId': orderId,
              'itemCount': _displayItems.length,
              'total': _total,
            });
          }
        }
      } else {
        if (mounted) _showOrderRejected(response.data['message'] ?? 'Order failed');
      }
    } on DioException catch (e) {
      debugPrint('Place order error: $e');
      if (isOrderInLine(e)) {
        if (mounted) await showOrderInLineDialog(context);
        return;
      }
      final msg = e.response?.data?['message'] as String? ?? 'Order could not be placed — check your connection and try again.';
      if (mounted) _showOrderRejected(msg);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showOrderRejected(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: AppColors.error,
        duration: const Duration(seconds: 5),
        content: Row(children: [
          const Icon(Icons.error_outline, color: Colors.white),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600))),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => goBack(context, '/cart'),
        ),
        title: Text('Checkout', style: AppTextStyles.headlineLgMobile.copyWith(color: Colors.white, fontSize: 22)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.marginMobile),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('My Cart', style: AppTextStyles.headlineMd.copyWith(color: AppColors.onSurface)),
                Text('(${_displayItems.length} items)', style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
              ],
            ),
            const SizedBox(height: AppSpacing.base),
            ..._displayItems.map((item) => Container(
                  margin: const EdgeInsets.only(bottom: AppSpacing.base),
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLowest,
                    borderRadius: BorderRadius.circular(AppRadius.base),
                    border: Border.all(color: AppColors.outlineVariant),
                  ),
                  child: Row(children: [
                    Container(
                      width: 56, height: 56,
                      decoration: BoxDecoration(color: AppColors.surfaceVariant, borderRadius: BorderRadius.circular(AppRadius.sm)),
                      child: const Icon(Icons.inventory_2_outlined, color: AppColors.outline),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item['name'] ?? '', style: AppTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600, color: AppColors.onSurface)),
                          Text('x${item['qty']}', style: AppTextStyles.bodySm.copyWith(color: AppColors.outline)),
                        ],
                      ),
                    ),
                    Text('PKR ${(item['price'] as num) * (item['qty'] as num)}',
                        style: AppTextStyles.labelMd.copyWith(color: AppColors.primary)),
                  ]),
                )),
            const SizedBox(height: AppSpacing.sm),

            Text('Fulfillment Details', style: AppTextStyles.headlineSm.copyWith(color: AppColors.onSurface)),
            const SizedBox(height: AppSpacing.base),
            Text('Delivery Address', style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
            const SizedBox(height: 6),
            TextField(
              controller: _addressController,
              style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurface),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.location_on, color: AppColors.outline),
                hintText: _loadingProfile ? 'Loading your saved address…' : 'Enter your delivery address',
                filled: true,
                fillColor: AppColors.surfaceContainerLowest,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(AppRadius.base), borderSide: BorderSide(color: AppColors.outlineVariant)),
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            // GPS location of the shop, from the profile, under the address.
            if (_shopLat != null && _shopLng != null)
              InkWell(
                onTap: _openShopOnMap,
                borderRadius: BorderRadius.circular(AppRadius.base),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLowest,
                    borderRadius: BorderRadius.circular(AppRadius.base),
                    border: Border.all(color: AppColors.outlineVariant),
                  ),
                  child: Row(children: [
                    const Icon(Icons.my_location, size: 18, color: AppColors.primary),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('Delivery location (from your profile)',
                            style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
                        Text('GPS: ${_shopLat!.toStringAsFixed(6)}, ${_shopLng!.toStringAsFixed(6)}',
                            style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurface)),
                      ]),
                    ),
                    Text('View on map', style: AppTextStyles.labelMd.copyWith(color: AppColors.primary)),
                  ]),
                ),
              )
            else if (!_loadingProfile)
              Text('No shop location saved yet — add it in your profile so deliveries can find you.',
                  style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
            const SizedBox(height: AppSpacing.sm),
            Text('Order Notes (Optional)', style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
            const SizedBox(height: 6),
            TextField(
              controller: _notesController,
              maxLines: 2,
              style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurface),
              decoration: InputDecoration(
                hintText: 'E.g., Deliver to side entrance...',
                filled: true,
                fillColor: AppColors.surfaceContainerLowest,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(AppRadius.base), borderSide: BorderSide(color: AppColors.outlineVariant)),
              ),
            ),
            const SizedBox(height: AppSpacing.md),

            // Order summary
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(AppRadius.lg)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Order Summary', style: AppTextStyles.headlineSm.copyWith(color: Colors.white)),
                const Divider(color: Colors.white24),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text('Subtotal', style: AppTextStyles.bodyMd.copyWith(color: Colors.white70)),
                  Text('PKR $_total', style: AppTextStyles.bodyMd.copyWith(color: Colors.white)),
                ]),
                const SizedBox(height: AppSpacing.xs),
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.xs),
                  child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    Text('Total Amount', style: AppTextStyles.headlineSm.copyWith(color: Colors.white)),
                    Text('PKR $_total', style: AppTextStyles.headlineSm.copyWith(color: Colors.white, fontWeight: FontWeight.bold)),
                  ]),
                ),
              ]),
            ),
            const SizedBox(height: AppSpacing.md),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isLoading ? null : _placeOrder,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                ),
                child: _isLoading
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text('Place Order', style: AppTextStyles.headlineSm.copyWith(color: Colors.white)),
                          const SizedBox(width: 8),
                          const Icon(Icons.arrow_forward, color: Colors.white),
                        ],
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
