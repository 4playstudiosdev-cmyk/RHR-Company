import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/cart_store.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';
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
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        title: const Text('Products', style: TextStyle(
            color: AppColors.white, fontWeight: FontWeight.bold)),
        actions: [
          Stack(children: [
            IconButton(
              icon: const Icon(Icons.shopping_cart_outlined, color: AppColors.white),
              onPressed: () => context.go('/cart'),
            ),
            if (cartCount > 0)
              Positioned(
                right: 6, top: 6,
                child: Container(
                  width: 18, height: 18,
                  decoration: const BoxDecoration(
                      color: AppColors.orange, shape: BoxShape.circle),
                  child: Center(
                    child: Text('$cartCount', style: const TextStyle(
                        color: Colors.white, fontSize: 10,
                        fontWeight: FontWeight.bold)),
                  ),
                ),
              ),
          ]),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              onChanged: (v) { _search = v; _filterProducts(); },
              decoration: InputDecoration(
                hintText: 'Search products...',
                hintStyle: const TextStyle(color: Colors.white54),
                prefixIcon: const Icon(Icons.search, color: Colors.white54),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.15),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
              ),
              style: const TextStyle(color: Colors.white),
            ),
          ),
        ),
      ),
      body: _isLoading
          ? GridView.builder(
              padding: const EdgeInsets.all(16),
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
                      const Icon(Icons.inventory_2_outlined,
                          size: 64, color: AppColors.disabled),
                      const SizedBox(height: 16),
                      const Text('No products found', style: TextStyle(
                          color: AppColors.steelBlue, fontSize: 16)),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: _loadProducts,
                        child: const Text('Retry',
                            style: TextStyle(color: AppColors.orange)),
                      ),
                    ],
                  ),
                )
              : GridView.builder(
                  padding: const EdgeInsets.all(16),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2, childAspectRatio: 0.72,
                      crossAxisSpacing: 12, mainAxisSpacing: 12),
                  itemCount: _filtered.length,
                  itemBuilder: (_, i) {
                    final p      = _filtered[i];
                    final pid    = p['id'] ?? '';
                    final qty    = _qtyFor(pid);
                    final price  = (p['price'] ?? 0).toDouble();
                    final unit   = (p['unit'] ?? '') as String;

                    return StaggeredFadeIn(
                      index: i,
                      scale: true,
                      child: Container(
                      decoration: BoxDecoration(
                          color: AppColors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: qty > 0
                              ? Border.all(color: AppColors.orange, width: 2)
                              : null,
                          boxShadow: [BoxShadow(
                              color: Colors.black.withValues(alpha: 0.06),
                              blurRadius: 10, offset: const Offset(0, 3))]),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          TapScale(
                            onTap: () => context.go('/product-detail', extra: p),
                            child: Container(
                              height: 110,
                              decoration: BoxDecoration(
                                  color: AppColors.warmGrey,
                                  borderRadius: const BorderRadius.vertical(
                                      top: Radius.circular(16))),
                              child: p['image_url'] != null
                                  ? ClipRRect(
                                      borderRadius: const BorderRadius.vertical(
                                          top: Radius.circular(16)),
                                      child: Image.network(
                                        p['image_url'],
                                        fit: BoxFit.cover,
                                        width: double.infinity,
                                        errorBuilder: (c, e, s) => const Icon(
                                            Icons.inventory_2_outlined,
                                            size: 50, color: AppColors.steelBlue),
                                      ),
                                    )
                                  : const Center(child: Icon(
                                      Icons.inventory_2_outlined,
                                      size: 50, color: AppColors.steelBlue)),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.all(10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(p['name'] ?? 'Product',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        color: AppColors.navy, fontSize: 13),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis),
                                Text(unit.isEmpty ? 'pcs' : unit,
                                    style: const TextStyle(
                                        color: AppColors.steelBlue, fontSize: 11)),
                                const SizedBox(height: 4),
                                Text('PKR ${price.toStringAsFixed(0)}',
                                    style: const TextStyle(
                                        color: AppColors.orange,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 14)),
                                const SizedBox(height: 6),
                                qty == 0
                                    ? SizedBox(
                                        width: double.infinity,
                                        height: 32,
                                        child: ElevatedButton(
                                          onPressed: () => CartStore.instance.add(
                                              id: pid, name: p['name'] ?? 'Product',
                                              price: price, unit: unit, qty: 1),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: AppColors.navy,
                                            shape: RoundedRectangleBorder(
                                                borderRadius:
                                                    BorderRadius.circular(8)),
                                          ),
                                          child: const Text('Add to Cart',
                                              style: TextStyle(
                                                  color: Colors.white,
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.bold)),
                                        ),
                                      )
                                    : Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.spaceBetween,
                                        children: [
                                          GestureDetector(
                                            onTap: () => CartStore.instance
                                                .updateQty(pid, qty - 1),
                                            child: Container(
                                              width: 28, height: 28,
                                              decoration: BoxDecoration(
                                                  color: AppColors.warmGrey,
                                                  borderRadius:
                                                      BorderRadius.circular(6)),
                                              child: const Icon(Icons.remove,
                                                  size: 14,
                                                  color: AppColors.navy),
                                            ),
                                          ),
                                          Text('$qty',
                                              style: const TextStyle(
                                                  fontWeight: FontWeight.bold,
                                                  color: AppColors.navy,
                                                  fontSize: 15)),
                                          GestureDetector(
                                            onTap: () => CartStore.instance
                                                .updateQty(pid, qty + 1),
                                            child: Container(
                                              width: 28, height: 28,
                                              decoration: BoxDecoration(
                                                  color: AppColors.orange,
                                                  borderRadius:
                                                      BorderRadius.circular(6)),
                                              child: const Icon(Icons.add,
                                                  size: 14,
                                                  color: Colors.white),
                                            ),
                                          ),
                                        ],
                                      ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      ),
                    );
                  },
                ),
      bottomNavigationBar: const RHRBottomNav(currentIndex: 1),
        );
      },
    );
  }
}
