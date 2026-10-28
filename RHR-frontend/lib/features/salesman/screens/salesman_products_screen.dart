import 'package:flutter/material.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/router/app_transitions.dart';
import '../../../shared/widgets/premium_ui.dart';

class SalesmanProductsScreen extends StatefulWidget {
  const SalesmanProductsScreen({super.key});

  @override
  State<SalesmanProductsScreen> createState() => _SalesmanProductsScreenState();
}

class _SalesmanProductsScreenState extends State<SalesmanProductsScreen> {
  List<Map<String, dynamic>> _categories = [];
  List<Map<String, dynamic>> _products = [];
  bool _loading = true;
  String? _selectedCategoryId;

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

  List<Map<String, dynamic>> get _filteredProducts {
    return _selectedCategoryId == null
        ? _products
        : _products.where((p) => p['category_id'] == _selectedCategoryId).toList();
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
            color: kCardBg,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.all(20),
            children: [
              Center(
                child: Container(
                  width: 40, height: 4,
                  margin: const EdgeInsets.only(bottom: 18),
                  decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  width: double.infinity,
                  height: 180,
                  color: kNavy.withValues(alpha: 0.07),
                  child: (p['image_url'] != null && (p['image_url'] as String).isNotEmpty)
                      ? Image.network(p['image_url'], fit: BoxFit.cover,
                          errorBuilder: (c, e, s) => const Icon(Icons.inventory_2_outlined, color: kNavy, size: 56))
                      : const Icon(Icons.inventory_2_outlined, color: kNavy, size: 56),
                ),
              ),
              const SizedBox(height: 16),
              Text(p['name'] ?? '',
                  style: const TextStyle(fontWeight: FontWeight.w800, color: kNavy, fontSize: 19)),
              if ((p['categories']?['name'] ?? '').toString().isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(p['categories']['name'], style: const TextStyle(color: kTextMuted, fontSize: 13)),
              ],
              const SizedBox(height: 12),
              Row(children: [
                Text('PKR ${((p['price'] ?? 0) as num).toStringAsFixed(0)}',
                    style: const TextStyle(fontWeight: FontWeight.w800, color: kNavy, fontSize: 22)),
                if ((p['unit'] ?? '').toString().isNotEmpty) ...[
                  const SizedBox(width: 6),
                  Text('/ ${p['unit']}', style: const TextStyle(color: kTextMuted, fontSize: 14)),
                ],
              ]),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: ((p['stock_quantity'] ?? 0) as num) > 0
                      ? kGreen.withValues(alpha: 0.10)
                      : kRed.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: ((p['stock_quantity'] ?? 0) as num) > 0
                      ? kGreen.withValues(alpha: 0.3)
                      : kRed.withValues(alpha: 0.3)),
                ),
                child: Text(
                  ((p['stock_quantity'] ?? 0) as num) > 0
                      ? 'In Stock — ${p['stock_quantity']} ${p['unit'] ?? ''}'
                      : 'Out of Stock',
                  style: TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 12,
                    color: ((p['stock_quantity'] ?? 0) as num) > 0 ? kGreen : kRed,
                  ),
                ),
              ),
              if ((p['description'] ?? '').toString().trim().isNotEmpty) ...[
                const SizedBox(height: 20),
                const Text('Description', style: TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 15)),
                const SizedBox(height: 8),
                Text(p['description'], style: const TextStyle(color: kTextMuted, fontSize: 14, height: 1.5)),
              ],
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(10)),
                child: const Row(children: [
                  Icon(Icons.info_outline_rounded, size: 14, color: kTextMuted),
                  SizedBox(width: 8),
                  Expanded(child: Text('To order for a customer, use New Order from the dashboard.',
                      style: TextStyle(color: kTextMuted, fontSize: 12))),
                ]),
              ),
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
      backgroundColor: kCardBg,
      appBar: premiumAppBar(
        'Products',
        subtitle: '${_filteredProducts.length} items',
        onBack: () => goBack(context, '/salesman-dashboard'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: kNavy))
          : Column(children: [
              Container(
                color: Colors.white,
                child: SizedBox(
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
              ),
              Expanded(
                child: RefreshIndicator(
                  color: kGreen,
                  onRefresh: () => _load(showSpinner: false),
                  child: _filteredProducts.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: const [PremiumEmpty(icon: Icons.inventory_2_outlined, title: 'No products in this category')],
                        )
                      : ListView.builder(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
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
      child: GestureDetector(
        onTap: () => setState(() => _selectedCategoryId = id),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: selected ? kNavy : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: selected ? kNavy : const Color(0xFFE0E5EF)),
            boxShadow: selected ? [BoxShadow(color: kNavy.withValues(alpha: 0.25), blurRadius: 6, offset: const Offset(0, 2))] : [],
          ),
          child: Text(label,
              style: TextStyle(
                  color: selected ? Colors.white : kNavy,
                  fontWeight: FontWeight.w700,
                  fontSize: 12)),
        ),
      ),
    );
  }

  Widget _productRow(Map<String, dynamic> p) {
    final imageUrl = p['image_url'] as String?;
    final price = ((p['price'] ?? 0) as num).toDouble();
    final inStock = ((p['stock_quantity'] ?? 0) as num) > 0;

    return GestureDetector(
      onTap: () => _openDetail(p),
      child: PremiumCard(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Container(
            width: 52, height: 52,
            decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(12)),
            clipBehavior: Clip.antiAlias,
            child: (imageUrl != null && imageUrl.isNotEmpty)
                ? Image.network(imageUrl, fit: BoxFit.cover,
                    errorBuilder: (c, e, s) => const Icon(Icons.inventory_2_outlined, color: kNavy, size: 24))
                : const Icon(Icons.inventory_2_outlined, color: kNavy, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p['name'] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 13)),
              const SizedBox(height: 2),
              Text('PKR ${price.toStringAsFixed(0)}',
                  style: const TextStyle(color: kTextMuted, fontSize: 12, fontWeight: FontWeight.w600)),
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: (inStock ? kGreen : kRed).withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(inStock ? 'In Stock' : 'Out',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: inStock ? kGreen : kRed)),
            ),
            const SizedBox(height: 4),
            const Icon(Icons.chevron_right_rounded, color: kTextMuted, size: 18),
          ]),
        ]),
      ),
    );
  }
}
