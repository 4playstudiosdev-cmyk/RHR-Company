import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/router/app_transitions.dart';

/// Product catalogue browse screen for salesmen — category chips up top,
/// a list of products below. View-only: tapping a product opens its full
/// description/detail, same as the customer app's catalogue, so a
/// salesman can show a customer exactly what they're getting. Actually
/// placing an order always goes through create_order_screen.dart ("New
/// Order") — this screen used to also let a salesman build a cart and
/// checkout directly, which meant two different places could create an
/// order; that's now the New Order screen's job alone.
class SalesmanProductsScreen extends StatefulWidget {
  const SalesmanProductsScreen({super.key});

  @override
  State<SalesmanProductsScreen> createState() => _SalesmanProductsScreenState();
}

class _SalesmanProductsScreenState extends State<SalesmanProductsScreen> {
  List<Map<String, dynamic>> _categories = [];
  List<Map<String, dynamic>> _products = [];
  bool _loading = true;
  String? _selectedCategoryId; // null = All

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool showSpinner = true}) async {
    if (showSpinner) setState(() => _loading = true);
    try {
      final results = await Future.wait([
        DioClient.instance.get(ApiEndpoints.categories),
        DioClient.instance.get(ApiEndpoints.products, queryParameters: {'limit': 200}),
      ]);
      if (results[0].data['success'] == true) {
        _categories = List<Map<String, dynamic>>.from(results[0].data['data'] ?? []);
      }
      if (results[1].data['success'] == true) {
        final raw = results[1].data['data'];
        _products = List<Map<String, dynamic>>.from(raw is Map ? (raw['products'] ?? raw['data'] ?? []) : raw ?? []);
      }
    } catch (e) {
      debugPrint('Products browse load error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // Default ("All") view leads with Tile Bond products and anything
  // branded Readymix — the two lines salesmen sell most — before
  // everything else, instead of whatever order the API happened to
  // return. A picked category still shows that category's own order.
  static bool _isPriority(Map<String, dynamic> p) {
    final name = (p['name'] ?? '').toString().toLowerCase();
    final category = (p['categories']?['name'] ?? '').toString().toLowerCase();
    return name.contains('readymix') || category.contains('tile bond');
  }

  List<Map<String, dynamic>> get _filteredProducts {
    final list = _selectedCategoryId == null
        ? _products
        : _products.where((p) => p['category_id'] == _selectedCategoryId).toList();
    if (_selectedCategoryId != null) return list;
    final indexed = list.asMap().entries.toList();
    indexed.sort((a, b) {
      final pa = _isPriority(a.value) ? 0 : 1;
      final pb = _isPriority(b.value) ? 0 : 1;
      if (pa != pb) return pa.compareTo(pb);
      return a.key.compareTo(b.key);
    });
    return indexed.map((e) => e.value).toList();
  }

  void _openDetail(Map<String, dynamic> p) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => DraggableScrollableSheet(
        initialChildSize: 0.65,
        maxChildSize: 0.9,
        minChildSize: 0.4,
        expand: false,
        builder: (_, scrollController) => Container(
          decoration: const BoxDecoration(
            color: AppColors.warmGrey,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.all(20),
            children: [
              Container(
                margin: const EdgeInsets.only(bottom: 16),
                width: 40, height: 4,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: AppColors.steelBlue.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(2)),
              ),
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  width: double.infinity,
                  height: 180,
                  color: AppColors.orange.withValues(alpha: 0.12),
                  child: (p['image_url'] != null && (p['image_url'] as String).isNotEmpty)
                      ? Image.network(p['image_url'], fit: BoxFit.cover,
                          errorBuilder: (c, e, s) => const Icon(Icons.inventory_2_outlined, color: AppColors.orange, size: 56))
                      : const Icon(Icons.inventory_2_outlined, color: AppColors.orange, size: 56),
                ),
              ),
              const SizedBox(height: 16),
              Text(p['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 19)),
              if ((p['categories']?['name'] ?? '').toString().isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(p['categories']['name'], style: const TextStyle(color: AppColors.steelBlue, fontSize: 13)),
              ],
              const SizedBox(height: 12),
              Row(children: [
                Text('PKR ${((p['price'] ?? 0) as num).toStringAsFixed(0)}',
                    style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.orange, fontSize: 20)),
                if ((p['unit'] ?? '').toString().isNotEmpty) ...[
                  const SizedBox(width: 6),
                  Text('/ ${p['unit']}', style: const TextStyle(color: AppColors.steelBlue, fontSize: 14)),
                ],
              ]),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: ((p['stock_quantity'] ?? 0) as num) > 0
                      ? AppColors.success.withValues(alpha: 0.12)
                      : AppColors.error.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  ((p['stock_quantity'] ?? 0) as num) > 0
                      ? 'In Stock — ${p['stock_quantity']} ${p['unit'] ?? ''}'
                      : 'Out of Stock',
                  style: TextStyle(
                    fontWeight: FontWeight.bold, fontSize: 12,
                    color: ((p['stock_quantity'] ?? 0) as num) > 0 ? AppColors.success : AppColors.error,
                  ),
                ),
              ),
              if ((p['description'] ?? '').toString().trim().isNotEmpty) ...[
                const SizedBox(height: 20),
                const Text('Description', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 15)),
                const SizedBox(height: 8),
                Text(p['description'], style: const TextStyle(color: AppColors.steelBlue, fontSize: 14, height: 1.5)),
              ],
              const SizedBox(height: 24),
              const Text('To order this for a customer, use New Order from the dashboard.',
                  style: TextStyle(color: AppColors.steelBlue, fontSize: 12, fontStyle: FontStyle.italic)),
              const SizedBox(height: 10),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: () => goBack(context, '/salesman-dashboard')),
        title: const Text('Products', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : Column(children: [
              SizedBox(
                height: 48,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  children: [
                    _categoryChip(null, 'All'),
                    ..._categories.map((c) => _categoryChip(c['id'] as String, c['name'] ?? '')),
                  ],
                ),
              ),
              Expanded(
                child: RefreshIndicator(
                  color: AppColors.orange,
                  onRefresh: () => _load(showSpinner: false),
                  child: _filteredProducts.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: const [
                            Padding(
                              padding: EdgeInsets.only(top: 80),
                              child: Center(child: Text('No products in this category.', style: TextStyle(color: AppColors.steelBlue))),
                            ),
                          ],
                        )
                      : ListView.builder(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                          itemCount: _filteredProducts.length,
                          itemBuilder: (context, i) => _productRow(_filteredProducts[i]),
                        ),
                ),
              ),
            ]),
    );
  }

  Widget _categoryChip(String? id, String label) {
    final selected = _selectedCategoryId == id;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        selectedColor: AppColors.orange,
        labelStyle: TextStyle(color: selected ? Colors.white : AppColors.navy, fontWeight: FontWeight.w600),
        backgroundColor: AppColors.white,
        onSelected: (_) => setState(() => _selectedCategoryId = id),
      ),
    );
  }

  Widget _productRow(Map<String, dynamic> p) {
    final imageUrl = p['image_url'] as String?;
    final price = ((p['price'] ?? 0) as num).toDouble();
    return GestureDetector(
      onTap: () => _openDetail(p),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 6)],
        ),
        child: Row(children: [
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(color: AppColors.orange.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
            child: (imageUrl != null && imageUrl.isNotEmpty)
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(imageUrl, fit: BoxFit.cover,
                        errorBuilder: (c, e, s) => const Icon(Icons.inventory_2_outlined, color: AppColors.orange, size: 24)))
                : const Icon(Icons.inventory_2_outlined, color: AppColors.orange, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p['name'] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 13)),
              Text('PKR ${price.toStringAsFixed(0)}', style: const TextStyle(color: AppColors.orange, fontSize: 12)),
            ]),
          ),
          const Icon(Icons.chevron_right, color: AppColors.steelBlue),
        ]),
      ),
    );
  }
}
