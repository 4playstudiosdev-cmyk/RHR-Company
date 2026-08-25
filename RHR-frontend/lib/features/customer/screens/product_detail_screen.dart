import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/cart_store.dart';

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
    final category   = (_product?['categories']?['name'] as String?) ?? '';
    final unit       = _product?['unit']            ?? '';
    final price      = (_product?['price'] ?? 0) as num;
    final stock      = (_product?['stock_quantity'] ?? 0) as num;
    final desc       = _product?['description']     ?? '';
    final imageUrl   = _product?['image_url']       as String?;
    final inStock    = stock > 0;
    final totalPrice = price * _quantity;

    return Scaffold(
      backgroundColor: AppColors.surfaceContainerLowest,
      appBar: AppBar(
        backgroundColor: AppColors.surfaceContainerLowest,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.primaryContainer),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/catalogue'),
        ),
        title: Text('Product Details', style: AppTextStyles.headlineSm.copyWith(color: AppColors.primaryContainer)),
        actions: [
          ListenableBuilder(
            listenable: CartStore.instance,
            builder: (context, _) {
              final count = CartStore.instance.itemCount;
              return Stack(clipBehavior: Clip.none, children: [
                IconButton(
                  icon: const Icon(Icons.shopping_cart),
                  onPressed: () => context.go('/cart'),
                ),
                if (count > 0)
                  Positioned(
                    right: 4, top: 4,
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      decoration: const BoxDecoration(color: AppColors.error, shape: BoxShape.circle),
                      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                      child: Text('$count', textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold)),
                    ),
                  ),
              ]);
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : _product == null
              ? Center(child: Text('Product not found.', style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurfaceVariant)))
              : SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Image
                      Stack(children: [
                        AspectRatio(
                          aspectRatio: 1,
                          child: Container(
                            color: AppColors.surfaceVariant.withValues(alpha: 0.5),
                            child: imageUrl != null && imageUrl.isNotEmpty
                                ? Image.network(imageUrl, fit: BoxFit.contain,
                                    errorBuilder: (_, __, ___) => const Icon(Icons.inventory_2_outlined, size: 120, color: AppColors.secondary))
                                : const Icon(Icons.inventory_2_outlined, size: 120, color: AppColors.secondary),
                          ),
                        ),
                        Positioned(
                          top: 16, left: 16,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(AppRadius.full)),
                            child: Text(category.isNotEmpty ? category : 'RHR Quality',
                                style: AppTextStyles.labelMd.copyWith(color: Colors.white)),
                          ),
                        ),
                      ]),

                      Padding(
                        padding: const EdgeInsets.all(AppSpacing.marginMobile),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Info card
                            Container(
                              padding: const EdgeInsets.all(AppSpacing.md),
                              decoration: BoxDecoration(
                                color: AppColors.surfaceContainerLowest,
                                borderRadius: BorderRadius.circular(AppRadius.lg),
                                border: Border.all(color: AppColors.outlineVariant.withValues(alpha: 0.5)),
                              ),
                              width: double.infinity,
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(name, style: AppTextStyles.headlineLgMobile.copyWith(color: AppColors.primaryContainer)),
                                const SizedBox(height: AppSpacing.base),
                                Text.rich(TextSpan(children: [
                                  TextSpan(text: 'PKR $price ', style: AppTextStyles.headlineMd.copyWith(color: AppColors.secondary, fontWeight: FontWeight.bold)),
                                  TextSpan(text: unit.isNotEmpty ? '/ $unit' : '', style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurfaceVariant)),
                                ])),
                                const SizedBox(height: AppSpacing.md),
                                Row(children: [
                                  Icon(inStock ? Icons.check_circle : Icons.cancel, color: inStock ? AppColors.success : AppColors.error, size: 20),
                                  const SizedBox(width: 8),
                                  Text(inStock ? '$stock ${unit.isEmpty ? "units" : unit} available' : 'Out of stock',
                                      style: AppTextStyles.bodySm.copyWith(color: inStock ? AppColors.success : AppColors.error, fontWeight: FontWeight.w600)),
                                ]),
                                const SizedBox(height: AppSpacing.md),
                                const Divider(color: AppColors.outlineVariant),
                                const SizedBox(height: AppSpacing.base),
                                Text('Quantity', style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
                                const SizedBox(height: AppSpacing.base),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Container(
                                      decoration: BoxDecoration(border: Border.all(color: AppColors.outlineVariant), borderRadius: BorderRadius.circular(AppRadius.base)),
                                      child: Row(children: [
                                        IconButton(
                                          onPressed: () { if (_quantity > 1) setState(() => _quantity--); },
                                          icon: const Icon(Icons.remove, color: AppColors.primaryContainer),
                                        ),
                                        Container(
                                          width: 44,
                                          alignment: Alignment.center,
                                          decoration: const BoxDecoration(
                                              border: Border.symmetric(vertical: BorderSide(color: AppColors.outlineVariant))),
                                          child: Text('$_quantity', style: AppTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600, color: AppColors.primaryContainer)),
                                        ),
                                        IconButton(
                                          onPressed: () => setState(() => _quantity++),
                                          icon: const Icon(Icons.add, color: AppColors.primaryContainer),
                                        ),
                                      ]),
                                    ),
                                    Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                      Text('Total Price', style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                                      Text('PKR $totalPrice', style: AppTextStyles.headlineSm.copyWith(color: AppColors.primaryContainer)),
                                    ]),
                                  ],
                                ),
                              ]),
                            ),
                            const SizedBox(height: AppSpacing.md),

                            if (desc.isNotEmpty)
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(AppSpacing.md),
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceContainerLowest,
                                  border: Border(
                                    left: const BorderSide(color: AppColors.primaryContainer, width: 4),
                                    top: BorderSide(color: AppColors.outlineVariant.withValues(alpha: 0.3)),
                                    right: BorderSide(color: AppColors.outlineVariant.withValues(alpha: 0.3)),
                                    bottom: BorderSide(color: AppColors.outlineVariant.withValues(alpha: 0.3)),
                                  ),
                                  borderRadius: const BorderRadius.horizontal(right: Radius.circular(AppRadius.lg)),
                                ),
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text('Product Description', style: AppTextStyles.headlineSm.copyWith(color: AppColors.primaryContainer, fontSize: 16)),
                                  const SizedBox(height: 8),
                                  Text(desc, style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurfaceVariant)),
                                ]),
                              ),
                            const SizedBox(height: AppSpacing.md),

                            Row(children: [
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () {
                                    CartStore.instance.add(id: widget.productId ?? '', name: name, price: price, unit: unit, qty: _quantity);
                                    context.go('/cart');
                                  },
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: AppColors.primaryContainer,
                                    side: const BorderSide(color: AppColors.primaryContainer, width: 2),
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                                  ),
                                  icon: const Icon(Icons.add_shopping_cart, size: 20),
                                  label: Text('Add to Cart', style: AppTextStyles.labelMd.copyWith(color: AppColors.primaryContainer)),
                                ),
                              ),
                              const SizedBox(width: AppSpacing.base),
                              Expanded(
                                child: ElevatedButton(
                                  onPressed: () {
                                    CartStore.instance.add(id: widget.productId ?? '', name: name, price: price, unit: unit, qty: _quantity);
                                    context.go('/place-order', extra: CartStore.instance.items);
                                  },
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppColors.primaryContainer,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                                  ),
                                  child: Text('Buy Now', style: AppTextStyles.labelMd.copyWith(color: Colors.white)),
                                ),
                              ),
                            ]),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}
