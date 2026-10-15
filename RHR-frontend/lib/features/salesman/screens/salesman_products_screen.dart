import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/router/app_transitions.dart';

/// Product catalogue browse screen for salesmen — category chips up top,
/// a grid of tiles (image/name/price/quick-add) below. Separate from
/// create_order_screen.dart's dropdown-based picker, which still exists
/// for the "I already know what they want" flow; this is the visual
/// "browse and build a cart" flow.
class SalesmanProductsScreen extends StatefulWidget {
  const SalesmanProductsScreen({super.key});

  @override
  State<SalesmanProductsScreen> createState() => _SalesmanProductsScreenState();
}

class _SalesmanProductsScreenState extends State<SalesmanProductsScreen> {
  List<Map<String, dynamic>> _categories = [];
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _customers = [];
  bool _loading = true;
  String? _selectedCategoryId; // null = All

  // product_id -> quantity
  final Map<String, int> _cart = {};

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
        DioClient.instance.get(ApiEndpoints.customers),
      ]);
      if (results[0].data['success'] == true) {
        _categories = List<Map<String, dynamic>>.from(results[0].data['data'] ?? []);
      }
      if (results[1].data['success'] == true) {
        final raw = results[1].data['data'];
        _products = List<Map<String, dynamic>>.from(raw is Map ? (raw['products'] ?? raw['data'] ?? []) : raw ?? []);
      }
      if (results[2].data['success'] == true) {
        _customers = List<Map<String, dynamic>>.from(results[2].data['data'] ?? []);
      }
    } catch (e) {
      debugPrint('Products browse load error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _filteredProducts {
    if (_selectedCategoryId == null) return _products;
    return _products.where((p) => p['category_id'] == _selectedCategoryId).toList();
  }

  int get _cartCount => _cart.values.fold(0, (s, q) => s + q);

  void _addToCart(String productId) {
    setState(() => _cart[productId] = (_cart[productId] ?? 0) + 1);
  }

  void _removeFromCart(String productId) {
    setState(() {
      final current = _cart[productId] ?? 0;
      if (current <= 1) {
        _cart.remove(productId);
      } else {
        _cart[productId] = current - 1;
      }
    });
  }

  Future<void> _checkout() async {
    String? selectedCustomerId;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Place Order'),
          content: DropdownButtonFormField<String>(
            initialValue: selectedCustomerId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Customer', border: OutlineInputBorder()),
            items: _customers.map((c) => DropdownMenuItem(
              value: c['id'] as String,
              child: Text(c['full_name'] ?? '', overflow: TextOverflow.ellipsis),
            )).toList(),
            onChanged: (v) => setDialogState(() => selectedCustomerId = v),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: selectedCustomerId == null ? null : () => Navigator.pop(dialogContext, true),
              child: const Text('Place Order'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true || selectedCustomerId == null) return;

    try {
      final items = _cart.entries.map((e) => {'product_id': e.key, 'quantity': e.value}).toList();
      final res = await DioClient.instance.post(ApiEndpoints.orders, data: {
        'customer_id': selectedCustomerId,
        'items': items,
      });
      if (res.data['success'] == true) {
        if (mounted) {
          setState(() => _cart.clear());
          await showSuccessCheck(context, message: 'Order Placed!');
          if (mounted) context.go('/salesman-dashboard');
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(res.data['message'] ?? 'Failed to place order')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
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
      floatingActionButton: _cartCount > 0
          ? FloatingActionButton.extended(
              backgroundColor: AppColors.orange,
              onPressed: _checkout,
              icon: const Icon(Icons.shopping_cart, color: Colors.white),
              label: Text('$_cartCount item(s) — Checkout', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            )
          : null,
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
    final productId = p['id'] as String;
    final qty = _cart[productId] ?? 0;
    final imageUrl = p['image_url'] as String?;
    final price = ((p['price'] ?? 0) as num).toDouble();
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: qty > 0 ? Border.all(color: AppColors.orange, width: 1.5) : null,
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
        if (qty == 0)
          GestureDetector(
            onTap: () => _addToCart(productId),
            child: Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(color: AppColors.orange, borderRadius: BorderRadius.circular(8)),
              child: const Icon(Icons.add, size: 18, color: Colors.white),
            ),
          )
        else
          Row(children: [
            GestureDetector(
              onTap: () => _removeFromCart(productId),
              child: Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(color: AppColors.warmGrey, borderRadius: BorderRadius.circular(6)),
                child: const Icon(Icons.remove, size: 16, color: AppColors.navy),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Text('$qty', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 16)),
            ),
            GestureDetector(
              onTap: () => _addToCart(productId),
              child: Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(color: AppColors.orange, borderRadius: BorderRadius.circular(6)),
                child: const Icon(Icons.add, size: 16, color: Colors.white),
              ),
            ),
          ]),
      ]),
    );
  }
}
