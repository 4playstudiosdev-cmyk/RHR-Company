import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/cart_store.dart';

class OrderPlacementScreen extends StatefulWidget {
  final List<Map<String, dynamic>>? cartItems;
  const OrderPlacementScreen({super.key, this.cartItems});

  @override
  State<OrderPlacementScreen> createState() => _OrderPlacementScreenState();
}

class _OrderPlacementScreenState extends State<OrderPlacementScreen> {
  bool _isLoading = false;

  List<Map<String, dynamic>> get _displayItems => widget.cartItems ?? [];

  num get _total => _displayItems.fold<num>(
      0, (sum, i) => sum + (i['price'] as num) * (i['qty'] as num));

  Future<void> _placeOrder() async {
    if (_displayItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Your cart is empty — add a product first')));
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
          'notes':            'Mobile app order',
          'delivery_address': 'Karachi',
        },
      );

      debugPrint('Place order: ${response.statusCode} | ${response.data}');

      if (response.data['success'] == true) {
        final orderId = response.data['data']['id'] as String;
        CartStore.instance.clear();
        if (mounted) {
          await showSuccessCheck(context, message: 'Order Placed!');
          if (mounted) context.go('/order-tracking', extra: orderId);
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(response.data['message'] ?? 'Order failed')));
        }
      }
    } catch (e) {
      debugPrint('Place order error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Order failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
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
          onPressed: () => context.go('/cart'),
        ),
        title: const Text('Confirm Order',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Order Summary',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppColors.navy)),
            const SizedBox(height: 12),
            Container(
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(14),
                boxShadow: [
                  BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)
                ],
              ),
              child: Column(
                children: [
                  Container(
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.orange,
                      borderRadius:
                          const BorderRadius.vertical(top: Radius.circular(14)),
                    ),
                  ),
                  ..._displayItems.map((item) => Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(item['name'] ?? '',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        color: AppColors.navy)),
                                Text(
                                    '${item['variant'] ?? item['unit'] ?? ''} x${item['qty']}',
                                    style: const TextStyle(
                                        color: AppColors.steelBlue,
                                        fontSize: 13)),
                              ],
                            ),
                            Text(
                              'PKR ${(item['price'] as num) * (item['qty'] as num)}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.orange),
                            ),
                          ],
                        ),
                      )),
                  const Divider(),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Total',
                            style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: AppColors.navy,
                                fontSize: 16)),
                        Text('PKR $_total',
                            style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                color: AppColors.orange,
                                fontSize: 20)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const Text('Delivery Address',
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.navy)),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.orange, width: 1.5),
              ),
              child: const Row(children: [
                Icon(Icons.location_on, color: AppColors.orange),
                SizedBox(width: 12),
                Expanded(
                  child: Text('Shop 12, Saddar Market, Karachi',
                      style: TextStyle(
                          color: AppColors.navy, fontWeight: FontWeight.w500)),
                ),
              ]),
            ),
            const SizedBox(height: 20),
            const Text('Payment Method',
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.navy)),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.navy, width: 1.5),
              ),
              child: const Row(children: [
                Icon(Icons.account_balance_wallet, color: AppColors.navy),
                SizedBox(width: 12),
                Text('Credit Account',
                    style: TextStyle(
                        color: AppColors.navy, fontWeight: FontWeight.w600)),
              ]),
            ),
            const SizedBox(height: 32),
            RHRButton(
              text: 'Place Order — PKR $_total',
              onPressed: _placeOrder,
              isLoading: _isLoading,
            ),
          ],
        ),
      ),
    );
  }
}
