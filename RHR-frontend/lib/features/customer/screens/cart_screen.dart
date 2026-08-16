import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/cart_store.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/widgets/tap_scale.dart';

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  bool _isLoading = false;

  Future<void> _placeOrder() async {
    final items = CartStore.instance.items;
    if (items.isEmpty) return;
    setState(() => _isLoading = true);
    try {
      final orderItems = items.map((p) => {
        'product_id': p['id'],
        'quantity':   p['qty'],
      }).toList();
      final response = await DioClient.instance.post(
        ApiEndpoints.orders,
        data: {
          'items':            orderItems,
          'notes':            'Mobile app order',
          'delivery_address': 'Karachi',
        },
      );
      debugPrint('Place order: ${response.statusCode} | ${response.data}');
      if (response.data['success'] == true) {
        CartStore.instance.clear();
        if (mounted) {
          await showSuccessCheck(context, message: 'Order Placed!');
          if (mounted) context.go('/orders');
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(
                  response.data['message'] ?? 'Order failed')));
        }
      }
    } catch (e) {
      debugPrint('Order error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: CartStore.instance,
      builder: (context, _) {
        final cartItems = CartStore.instance.items;
        final total = CartStore.instance.total;
        return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => context.go('/catalogue'),
        ),
        title: const Text('My Cart', style: TextStyle(
            color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: cartItems.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.shopping_cart_outlined,
                      size: 64, color: AppColors.disabled),
                  const SizedBox(height: 16),
                  const Text('Cart is empty', style: TextStyle(
                      color: AppColors.steelBlue, fontSize: 16)),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => context.go('/catalogue'),
                    child: const Text('Browse Products',
                        style: TextStyle(color: AppColors.orange)),
                  ),
                ],
              ),
            )
          : Column(children: [
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: cartItems.length,
                  itemBuilder: (_, i) {
                    final p     = cartItems[i];
                    final pid   = p['id'] as String;
                    final qty   = p['qty'] as int;
                    final price = (p['price'] ?? 0).toDouble();
                    return StaggeredFadeIn(
                      index: i,
                      child: Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                          color: AppColors.white,
                          borderRadius: BorderRadius.circular(14),
                          boxShadow: [BoxShadow(
                              color: Colors.black.withValues(alpha: 0.05),
                              blurRadius: 8, offset: const Offset(0, 2))]),
                      child: Row(children: [
                        Container(
                          width: 60, height: 60,
                          decoration: BoxDecoration(
                              color: AppColors.warmGrey,
                              borderRadius: BorderRadius.circular(10)),
                          child: p['image_url'] != null
                              ? ClipRRect(
                                  borderRadius: BorderRadius.circular(10),
                                  child: Image.network(p['image_url'],
                                      fit: BoxFit.cover))
                              : const Icon(Icons.inventory_2_outlined,
                                  color: AppColors.steelBlue),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(p['name'] ?? '',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: AppColors.navy, fontSize: 14)),
                              Text('PKR ${price.toStringAsFixed(0)}',
                                  style: const TextStyle(
                                      color: AppColors.orange,
                                      fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                        Row(children: [
                          TapScale(
                            onTap: () => CartStore.instance.updateQty(pid, qty - 1),
                            child: Container(
                              width: 30, height: 30,
                              decoration: BoxDecoration(
                                  color: AppColors.warmGrey,
                                  borderRadius: BorderRadius.circular(6)),
                              child: const Icon(Icons.remove,
                                  size: 16, color: AppColors.navy),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Text('$qty', style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                color: AppColors.navy, fontSize: 16)),
                          ),
                          TapScale(
                            onTap: () => CartStore.instance.updateQty(pid, qty + 1),
                            child: Container(
                              width: 30, height: 30,
                              decoration: BoxDecoration(
                                  color: AppColors.orange,
                                  borderRadius: BorderRadius.circular(6)),
                              child: const Icon(Icons.add,
                                  size: 16, color: Colors.white),
                            ),
                          ),
                        ]),
                      ]),
                      ),
                    );
                  },
                ),
              ),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: const BoxDecoration(
                    color: AppColors.white,
                    borderRadius:
                        BorderRadius.vertical(top: Radius.circular(24))),
                child: Column(children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Total', style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: AppColors.navy, fontSize: 18)),
                      Text('PKR ${total.toStringAsFixed(0)}',
                          style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: AppColors.orange, fontSize: 22)),
                    ],
                  ),
                  const SizedBox(height: 16),
                  RHRButton(text: 'Place Order',
                      onPressed: _placeOrder, isLoading: _isLoading),
                ]),
              ),
            ]),
        );
      },
    );
  }
}
