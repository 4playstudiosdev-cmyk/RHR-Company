import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/cart_store.dart';
import '../../../shared/widgets/rhr_bottom_nav.dart';
import '../../../shared/widgets/shimmer_box.dart';

class CatalogueScreen extends StatefulWidget {
  const CatalogueScreen({super.key});

  @override
  State<CatalogueScreen> createState() => _CatalogueScreenState();
}

class _CatalogueScreenState extends State<CatalogueScreen> {
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _filtered = [];
  bool _isLoading = true;
  String _search = '';

  @override
  void initState() { super.initState(); _loadProducts(); }

  Future<void> _loadProducts() async {
    setState(() => _isLoading = true);
    try {
      final response = await DioClient.instance.get(
        ApiEndpoints.products,
        queryParameters: {'page': 1, 'limit': 50},
      );
      debugPrint('Products: ${response.statusCode} | ${response.data}');
      if (response.data['success'] == true) {
        final data = response.data['data'];
        List<Map<String, dynamic>> products = [];
        if (data is List) {
          products = List<Map<String, dynamic>>.from(data);
        } else if (data is Map && data['products'] != null) {
          products = List<Map<String, dynamic>>.from(data['products']);
        }
        setState(() { _products = products; _filtered = products; });
      }
    } catch (e) { debugPrint('Products error: $e'); }
    finally { if (mounted) setState(() => _isLoading = false); }
  }

  void _filterProducts() {
    setState(() {
      _filtered = _products.where((p) => _search.isEmpty ||
          (p['name'] ?? '').toLowerCase().contains(_search.toLowerCase())).toList();
    });
  }

  int _qtyFor(String id) {
    final idx = CartStore.instance.items.indexWhere((i) => i['id'] == id);
    return idx == -1 ? 0 : CartStore.instance.items[idx]['qty'] as int;
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: CartStore.instance,
      builder: (context, _) {
        final cartCount = CartStore.instance.itemCount;
        return Scaffold(
          backgroundColor: AppColors.background,
          body: SafeArea(
            bottom: false,
            child: Column(
              children: [
                // Header
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(
                      AppSpacing.marginMobile, AppSpacing.base, AppSpacing.marginMobile, AppSpacing.lg),
                  decoration: const BoxDecoration(color: AppColors.onPrimaryFixed),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('RHR & Company', style: AppTextStyles.headlineMd.copyWith(color: Colors.white)),
                          Stack(clipBehavior: Clip.none, children: [
                            IconButton(
                              onPressed: () => context.go('/cart'),
                              icon: const Icon(Icons.shopping_cart, color: Colors.white),
                            ),
                            if (cartCount > 0)
                              Positioned(
                                right: 2, top: 2,
                                child: Container(
                                  padding: const EdgeInsets.all(3),
                                  decoration: const BoxDecoration(color: AppColors.error, shape: BoxShape.circle),
                                  constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                                  child: Text('$cartCount', textAlign: TextAlign.center,
                                      style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold)),
                                ),
                              ),
                          ]),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.base),
                      TextField(
                        onChanged: (v) { _search = v; _filterProducts(); },
                        style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurface),
                        decoration: InputDecoration(
                          hintText: 'Search products...',
                          hintStyle: AppTextStyles.bodyMd.copyWith(color: AppColors.outline),
                          prefixIcon: const Icon(Icons.search, color: AppColors.outline),
                          filled: true,
                          fillColor: AppColors.surface,
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(AppRadius.base), borderSide: BorderSide(color: AppColors.outlineVariant)),
                          contentPadding: const EdgeInsets.symmetric(vertical: 0),
                        ),
                      ),
                    ],
                  ),
                ),

                Expanded(
                  child: _isLoading
                      ? GridView.builder(
                          padding: const EdgeInsets.all(AppSpacing.marginMobile),
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 2, childAspectRatio: 0.72,
                              crossAxisSpacing: 12, mainAxisSpacing: 12),
                          itemCount: 6,
                          itemBuilder: (_, i) => const ShimmerProductCard(),
                        )
                      : _filtered.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Icon(Icons.inventory_2_outlined, size: 64, color: AppColors.outlineVariant),
                                  const SizedBox(height: AppSpacing.base),
                                  Text('No products found', style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurfaceVariant)),
                                  const SizedBox(height: AppSpacing.xs),
                                  TextButton(
                                    onPressed: _loadProducts,
                                    child: Text('Retry', style: AppTextStyles.labelMd.copyWith(color: AppColors.primary)),
                                  ),
                                ],
                              ),
                            )
                          : GridView.builder(
                              padding: const EdgeInsets.all(AppSpacing.marginMobile),
                              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 2, childAspectRatio: 0.68,
                                  crossAxisSpacing: 12, mainAxisSpacing: 12),
                              itemCount: _filtered.length,
                              itemBuilder: (_, i) {
                                final p      = _filtered[i];
                                final pid    = p['id'] ?? '';
                                final qty    = _qtyFor(pid);
                                final price  = (p['price'] ?? 0).toDouble();
                                final unit   = (p['unit'] ?? '') as String;

                                return Container(
                                  decoration: BoxDecoration(
                                      color: AppColors.surfaceContainerLowest,
                                      borderRadius: BorderRadius.circular(AppRadius.lg),
                                      border: Border.all(
                                          color: qty > 0 ? AppColors.primary : AppColors.outlineVariant,
                                          width: qty > 0 ? 2 : 1)),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      GestureDetector(
                                        onTap: () => context.go('/product-detail', extra: p),
                                        child: Container(
                                          height: 110,
                                          decoration: const BoxDecoration(
                                              color: AppColors.surfaceContainerLow,
                                              borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.lg))),
                                          child: p['image_url'] != null
                                              ? ClipRRect(
                                                  borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
                                                  child: Image.network(
                                                    p['image_url'],
                                                    fit: BoxFit.cover,
                                                    width: double.infinity,
                                                    errorBuilder: (c, e, s) => const Icon(Icons.inventory_2_outlined, size: 50, color: AppColors.secondary),
                                                  ),
                                                )
                                              : const Center(child: Icon(Icons.inventory_2_outlined, size: 50, color: AppColors.secondary)),
                                        ),
                                      ),
                                      Padding(
                                        padding: const EdgeInsets.all(10),
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(p['name'] ?? 'Product',
                                                style: AppTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600, color: AppColors.onSurface, fontSize: 13),
                                                maxLines: 1, overflow: TextOverflow.ellipsis),
                                            Text(unit.isEmpty ? 'pcs' : unit,
                                                style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant, fontSize: 11)),
                                            const SizedBox(height: 4),
                                            Text('PKR ${price.toStringAsFixed(0)}',
                                                style: AppTextStyles.headlineSm.copyWith(color: AppColors.primary, fontSize: 14)),
                                            const SizedBox(height: 6),
                                            qty == 0
                                                ? SizedBox(
                                                    width: double.infinity,
                                                    height: 32,
                                                    child: OutlinedButton(
                                                      onPressed: () => CartStore.instance.add(
                                                          id: pid, name: p['name'] ?? 'Product',
                                                          price: price, unit: unit, qty: 1),
                                                      style: OutlinedButton.styleFrom(
                                                        foregroundColor: AppColors.primary,
                                                        side: const BorderSide(color: AppColors.primary),
                                                        padding: EdgeInsets.zero,
                                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                                      ),
                                                      child: const Text('Add', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                                                    ),
                                                  )
                                                : Row(
                                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                                    children: [
                                                      GestureDetector(
                                                        onTap: () => CartStore.instance.updateQty(pid, qty - 1),
                                                        child: Container(
                                                          width: 28, height: 28,
                                                          decoration: BoxDecoration(color: AppColors.surfaceContainerLow, borderRadius: BorderRadius.circular(6)),
                                                          child: const Icon(Icons.remove, size: 14, color: AppColors.primary),
                                                        ),
                                                      ),
                                                      Text('$qty', style: AppTextStyles.headlineSm.copyWith(color: AppColors.primary, fontSize: 15)),
                                                      GestureDetector(
                                                        onTap: () => CartStore.instance.updateQty(pid, qty + 1),
                                                        child: Container(
                                                          width: 28, height: 28,
                                                          decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(6)),
                                                          child: const Icon(Icons.add, size: 14, color: Colors.white),
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                ),
              ],
            ),
          ),
          bottomNavigationBar: const RHRBottomNav(currentIndex: 1),
        );
      },
    );
  }
}
