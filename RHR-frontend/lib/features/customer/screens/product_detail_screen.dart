import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/cart_store.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';

class ProductDetailScreen extends StatefulWidget {
  final String? productId;
  const ProductDetailScreen({super.key, this.productId});

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  Map<String, dynamic>? _product;
  bool _isLoading = true;
  int _quantity = 1;

  @override
  void initState() {
    super.initState();
    if (widget.productId != null) _loadProduct();
  }

  Future<void> _loadProduct() async {
    try {
      final response = await DioClient.instance.get(
        '${ApiEndpoints.products}/${widget.productId}',
      );
      if (response.data['success'] == true) {
        setState(() => _product = response.data['data']);
      }
    } catch (e) {
      debugPrint('Product detail error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final name       = _product?['name']           ?? 'Product';
    // Backend nests category as categories: { name } via a join — not a flat 'category' string
    final category   = (_product?['categories']?['name'] as String?) ?? '';
    final unit       = _product?['unit']            ?? '';
    final price      = (_product?['price'] ?? 0) as num;
    final stock      = (_product?['stock_quantity'] ?? 0) as num;
    final desc       = _product?['description']     ?? '';
    final imageUrl   = _product?['image_url']       as String?;
    final inStock    = stock > 0;
    final totalPrice = price * _quantity;

    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => context.go('/catalogue'),
        ),
        title: const Text('Product Detail',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [
          ListenableBuilder(
            listenable: CartStore.instance,
            builder: (context, _) {
              final count = CartStore.instance.itemCount;
              return Stack(
                clipBehavior: Clip.none,
                children: [
                  IconButton(
                    icon: const Icon(Icons.shopping_cart_outlined, color: Colors.white),
                    onPressed: () => context.go('/cart'),
                  ),
                  if (count > 0)
                    Positioned(
                      right: 6,
                      top: 6,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(
                          color: AppColors.orange,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          '$count',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : _product == null
              ? const Center(
                  child: Text('Product not found.',
                      style: TextStyle(color: AppColors.steelBlue)))
              : SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Product Image
                      Container(
                        width: double.infinity,
                        height: 280,
                        color: AppColors.white,
                        child: Stack(
                          children: [
                            Center(
                              child: imageUrl != null && imageUrl.isNotEmpty
                                  ? Image.network(
                                      imageUrl,
                                      fit: BoxFit.contain,
                                      height: 240,
                                      errorBuilder: (_, __, ___) => const Icon(
                                          Icons.inventory_2_outlined,
                                          size: 120,
                                          color: AppColors.steelBlue),
                                    )
                                  : const Icon(Icons.inventory_2_outlined,
                                      size: 120, color: AppColors.steelBlue),
                            ),
                            Positioned(
                              top: 16,
                              right: 16,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 6),
                                decoration: BoxDecoration(
                                    color: AppColors.orange,
                                    borderRadius: BorderRadius.circular(20)),
                                child: Text(
                                  category.isNotEmpty ? category : 'RHR Quality',
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 12),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      // Orange stripe
                      Container(height: 4, color: AppColors.orange),

                      Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(name,
                                          style: const TextStyle(
                                              fontSize: 24,
                                              fontWeight: FontWeight.bold,
                                              color: AppColors.navy)),
                                      if (unit.isNotEmpty)
                                        Text(unit,
                                            style: const TextStyle(
                                                fontSize: 14,
                                                color: AppColors.steelBlue)),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 5),
                                  decoration: BoxDecoration(
                                    color: inStock
                                        ? AppColors.success.withValues(alpha: 0.1)
                                        : AppColors.error.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    inStock ? 'In Stock' : 'Out of Stock',
                                    style: TextStyle(
                                        color: inStock
                                            ? AppColors.success
                                            : AppColors.error,
                                        fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            Text('PKR $price',
                                style: const TextStyle(
                                    fontSize: 28,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.orange)),
                            if (unit.isNotEmpty)
                              Text('per $unit',
                                  style: const TextStyle(
                                      fontSize: 12, color: AppColors.steelBlue)),
                            const SizedBox(height: 20),

                            // Description card
                            if (desc.isNotEmpty)
                              StaggeredFadeIn(index: 0, child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(16),
                                margin: const EdgeInsets.only(bottom: 20),
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
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('Description',
                                        style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            color: AppColors.navy,
                                            fontSize: 16)),
                                    const SizedBox(height: 8),
                                    Text(desc,
                                        style: const TextStyle(
                                            color: AppColors.steelBlue,
                                            fontSize: 14,
                                            height: 1.5)),
                                  ],
                                ),
                              )),

                            // Quantity selector
                            StaggeredFadeIn(index: 1, child: Container(
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
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  const Text('Quantity',
                                      style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          color: AppColors.navy,
                                          fontSize: 16)),
                                  Row(
                                    children: [
                                      TapScale(
                                        onTap: () {
                                          if (_quantity > 1) setState(() => _quantity--);
                                        },
                                        child: Container(
                                          width: 36,
                                          height: 36,
                                          decoration: BoxDecoration(
                                              color: AppColors.warmGrey,
                                              borderRadius: BorderRadius.circular(8)),
                                          child: const Icon(Icons.remove,
                                              color: AppColors.navy),
                                        ),
                                      ),
                                      Padding(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 20),
                                        child: Text('$_quantity',
                                            style: const TextStyle(
                                                fontSize: 20,
                                                fontWeight: FontWeight.bold,
                                                color: AppColors.navy)),
                                      ),
                                      TapScale(
                                        onTap: () => setState(() => _quantity++),
                                        child: Container(
                                          width: 36,
                                          height: 36,
                                          decoration: BoxDecoration(
                                              color: AppColors.orange,
                                              borderRadius: BorderRadius.circular(8)),
                                          child: const Icon(Icons.add,
                                              color: Colors.white),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            )),
                            const SizedBox(height: 24),

                            RHRButton(
                              text: 'Add to Cart — PKR $totalPrice',
                              onPressed: () {
                                CartStore.instance.add(
                                  id: widget.productId ?? '',
                                  name: name,
                                  price: price,
                                  unit: unit,
                                  qty: _quantity,
                                );
                                context.go('/cart');
                              },
                            ),
                            const SizedBox(height: 12),
                            RHRButton(
                              text: 'Buy Now',
                              onPressed: () {
                                CartStore.instance.add(
                                  id: widget.productId ?? '',
                                  name: name,
                                  price: price,
                                  unit: unit,
                                  qty: _quantity,
                                );
                                context.go('/place-order', extra: CartStore.instance.items);
                              },
                              isSecondary: true,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}
