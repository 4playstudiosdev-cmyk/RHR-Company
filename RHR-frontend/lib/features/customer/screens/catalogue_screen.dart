import 'package:flutter/material.dart';
import '../../../shared/widgets/qty_field.dart';
import '../../../core/features/app_features.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/cart_store.dart';
import '../../../shared/order_qty_rules.dart';
import '../../../shared/widgets/rhr_bottom_nav.dart';
import '../../../shared/widgets/shimmer_box.dart';

class CatalogueScreen extends StatefulWidget {
  const CatalogueScreen({super.key});

  @override
  State<CatalogueScreen> createState() => _CatalogueScreenState();
}

class _CatalogueScreenState extends State<CatalogueScreen> {
  List<Map<String, dynamic>> _categories = [];
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _filtered = [];
  bool _isLoading = true;
  String _search = '';
  String? _selectedCategoryId; // null = All

  @override
  void initState() { super.initState(); _loadProducts(); }

  Future<void> _loadProducts() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        DioClient.instance.get(ApiEndpoints.categories),
        DioClient.instance.get(ApiEndpoints.products, queryParameters: {'page': 1, 'limit': 200}),
      ]);
      if (results[0].data['success'] == true) {
        _categories = List<Map<String, dynamic>>.from(results[0].data['data'] ?? []);
      }
      if (results[1].data['success'] == true) {
        final data = results[1].data['data'];
        List<Map<String, dynamic>> products = [];
        if (data is List) {
          products = List<Map<String, dynamic>>.from(data);
        } else if (data is Map && data['products'] != null) {
          products = List<Map<String, dynamic>>.from(data['products']);
        }
        // Already in the right merchandising order from the backend
        // (products.service.js#sortByMerchandisingOrder) — no client-side
        // re-sort needed, just keep that order through search/category filtering.
        _products = products;
      }
      setState(() => _filterProducts());
    } catch (e) { debugPrint('Products error: $e'); }
    finally { if (mounted) setState(() => _isLoading = false); }
  }

  void _filterProducts() {
    setState(() {
      _filtered = _products.where((p) {
        final matchesSearch = _search.isEmpty ||
            (p['name'] ?? '').toString().toLowerCase().contains(_search.toLowerCase());
        final matchesCategory = _selectedCategoryId == null || p['category_id'] == _selectedCategoryId;
        return matchesSearch && matchesCategory;
      }).toList();
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
        final cartTotal = CartStore.instance.total;
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
                      AppSpacing.marginMobile, AppSpacing.base, AppSpacing.marginMobile, AppSpacing.base),
                  decoration: const BoxDecoration(color: AppColors.onPrimaryFixed),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('RHR & Company', style: AppTextStyles.headlineMd.copyWith(color: Colors.white)),
                          Stack(clipBehavior: Clip.none, children: [
                            IconButton(
                              onPressed: () => context.push('/cart'),
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

                // Category filter chips
                SizedBox(
                  height: 44,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.marginMobile, vertical: 6),
                    children: [
                      _categoryChip(null, 'All'),
                      ..._categories.map((c) => _categoryChip(c['id'] as String, c['name'] ?? '')),
                    ],
                  ),
                ),

                Expanded(
                  child: _isLoading
                      ? ListView.builder(
                          padding: const EdgeInsets.all(AppSpacing.marginMobile),
                          itemCount: 6,
                          itemBuilder: (_, i) => const Padding(
                            padding: EdgeInsets.only(bottom: 10),
                            child: ShimmerProductCard(),
                          ),
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
                          : ListView.builder(
                              padding: EdgeInsets.fromLTRB(
                                  AppSpacing.marginMobile, 4, AppSpacing.marginMobile, cartCount > 0 ? 90 : AppSpacing.marginMobile),
                              itemCount: _filtered.length,
                              itemBuilder: (_, i) => _productRow(_filtered[i]),
                            ),
                ),
              ],
            ),
          ),
          bottomNavigationBar: cartCount > 0
              ? SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(AppSpacing.marginMobile, 8, AppSpacing.marginMobile, 8),
                    child: ElevatedButton(
                      onPressed: () => context.push('/cart'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
                        elevation: 2,
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('$cartCount item${cartCount == 1 ? '' : 's'} · PKR ${cartTotal.toStringAsFixed(0)}',
                              style: AppTextStyles.labelMd.copyWith(color: Colors.white)),
                          Row(children: [
                            Text('Review & Checkout', style: AppTextStyles.labelMd.copyWith(color: Colors.white, fontWeight: FontWeight.bold)),
                            const SizedBox(width: 4),
                            const Icon(Icons.arrow_forward, color: Colors.white, size: 16),
                          ]),
                        ],
                      ),
                    ),
                  ),
                )
              : const RHRBottomNav(currentIndex: 1),
        );
      },
    );
  }

  Widget _categoryChip(String? id, String label) {
    final selected = _selectedCategoryId == id;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        selectedColor: AppColors.primary,
        labelStyle: TextStyle(color: selected ? Colors.white : AppColors.onBackground, fontWeight: FontWeight.w600),
        backgroundColor: AppColors.surfaceContainerLowest,
        onSelected: (_) => setState(() { _selectedCategoryId = id; _filterProducts(); }),
      ),
    );
  }

  Widget _productRow(Map<String, dynamic> p) {
    final pid = p['id'] ?? '';
    final qty = _qtyFor(pid);
    final price = ((p['price'] ?? 0) as num).toDouble();
    final unit = (p['unit'] ?? '') as String;
    final category = (p['categories'] is Map ? p['categories']['name'] : '') ?? '';
    final step = qty > 0 ? CartStore.instance.stepFor(pid) : qtyRuleFor(name: p['name'] ?? '', category: category).step;
    final imageUrl = p['image_url'] as String?;

    return GestureDetector(
      onTap: () => context.push('/product-detail', extra: p),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: qty > 0 ? AppColors.primary : AppColors.outlineVariant, width: qty > 0 ? 2 : 1),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Image shrinks to make room for the full product name — never
          // truncate the name itself, per the alignment fix this mirrors
          // from the salesman app's product list.
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(color: AppColors.secondaryContainer, borderRadius: BorderRadius.circular(8)),
            child: (imageUrl != null && imageUrl.isNotEmpty)
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(imageUrl, fit: BoxFit.cover,
                        errorBuilder: (c, e, s) => const Icon(Icons.inventory_2_outlined, color: AppColors.secondary, size: 22)))
                : const Icon(Icons.inventory_2_outlined, color: AppColors.secondary, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p['name'] ?? 'Product',
                  style: AppTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600, color: AppColors.onSurface, fontSize: 13)),
              const SizedBox(height: 2),
              Text(unit.isEmpty ? 'PKR ${price.toStringAsFixed(0)}' : 'PKR ${price.toStringAsFixed(0)} / $unit',
                  style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant, fontSize: 11)),
            ]),
          ),
          const SizedBox(width: 10),
          if (!AppFeatures.has('place_order'))
            const SizedBox.shrink()
          else qty == 0
              ? SizedBox(
                  height: 32,
                  child: OutlinedButton(
                    onPressed: () => CartStore.instance.add(
                        id: pid, name: p['name'] ?? 'Product', price: price, unit: unit, category: category),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primary,
                      side: const BorderSide(color: AppColors.primary),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    ),
                    child: const Text('Add', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                )
              : Row(mainAxisSize: MainAxisSize.min, children: [
                  GestureDetector(
                    onTap: () => CartStore.instance.updateQty(pid, qty - step),
                    child: Container(
                      width: 28, height: 28,
                      decoration: BoxDecoration(color: AppColors.surfaceContainerLow, borderRadius: BorderRadius.circular(6)),
                      child: const Icon(Icons.remove, size: 14, color: AppColors.primary),
                    ),
                  ),
                  QtyField(
                    value: qty,
                    width: 46,
                    borderColor: AppColors.primary,
                    style: AppTextStyles.headlineSm.copyWith(color: AppColors.primary, fontSize: 15),
                    onChanged: (v) => CartStore.instance.updateQty(pid, v),
                  ),
                  GestureDetector(
                    onTap: () => CartStore.instance.updateQty(pid, qty + step),
                    child: Container(
                      width: 28, height: 28,
                      decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(6)),
                      child: const Icon(Icons.add, size: 14, color: Colors.white),
                    ),
                  ),
                ]),
        ]),
      ),
    );
  }
}
