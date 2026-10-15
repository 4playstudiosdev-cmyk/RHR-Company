import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/hive_service.dart';
import '../../../core/storage/sync_service.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/router/app_transitions.dart';

class CreateOrderScreen extends StatefulWidget {
  const CreateOrderScreen({super.key});

  @override
  State<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends State<CreateOrderScreen> {
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _categories = [];
  String? _selectedCategoryId; // null = All
  String? _selectedCustomerId;
  final _customerSearchController = TextEditingController();
  bool _isLoading = true;
  bool _isSubmitting = false;
  bool _isOnline = true;
  int _pendingSync = 0;

  @override
  void initState() {
    super.initState();
    _pendingSync = HiveService.getOfflineOrderCount();
    _loadData();
  }

  @override
  void dispose() {
    _customerSearchController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final pRes = await DioClient.instance.get(
          ApiEndpoints.products, queryParameters: {'limit': 50});
      final cRes = await DioClient.instance.get(ApiEndpoints.customers);
      final catRes = await DioClient.instance.get(ApiEndpoints.categories);
      setState(() {
        _isOnline = true;
        if (pRes.data['success'] == true) {
          final d = pRes.data['data'];
          _products = (d is List ? d : (d['products'] ?? []))
              .map<Map<String, dynamic>>((e) => {...Map<String, dynamic>.from(e), 'qty': 0})
              .toList();
        }
        if (cRes.data['success'] == true) {
          _customers = List<Map<String, dynamic>>.from(cRes.data['data'] ?? []);
        }
        if (catRes.data['success'] == true) {
          _categories = List<Map<String, dynamic>>.from(catRes.data['data'] ?? []);
        }
      });
    } catch (e) {
      setState(() => _isOnline = false);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _filteredProducts {
    if (_selectedCategoryId == null) return _products;
    return _products.where((p) => p['category_id'] == _selectedCategoryId).toList();
  }

  List<Map<String, dynamic>> get _filteredCustomers {
    final q = _customerSearchController.text.trim().toLowerCase();
    if (q.isEmpty) return _customers;
    return _customers.where((c) {
      final name = (c['full_name'] ?? c['name'] ?? '').toString().toLowerCase();
      final phone = (c['phone'] ?? '').toString().toLowerCase();
      return name.contains(q) || phone.contains(q);
    }).toList();
  }

  Map<String, dynamic>? get _selectedCustomer =>
      _selectedCustomerId == null ? null : _customers.firstWhere(
          (c) => c['id'] == _selectedCustomerId, orElse: () => {});

  Future<void> _syncNow() async {
    final r = await SyncService.syncOfflineOrders();
    setState(() => _pendingSync = HiveService.getOfflineOrderCount());
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Synced: ${r["synced"]} | Failed: ${r["failed"]}'),
          backgroundColor: r['failed'] == 0 ? AppColors.success : AppColors.orange));
    }
  }

  int get _total => _products.fold(0, (s, p) =>
      s + ((p['price'] ?? 0) as num).toInt() * ((p['qty'] ?? 0) as int));

  Future<void> _submit() async {
    if (_selectedCustomerId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Select a customer first')));
      return;
    }
    final sel = _products.where((p) => (p['qty'] ?? 0) > 0).toList();
    if (sel.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Add at least one product')));
      return;
    }
    setState(() => _isSubmitting = true);

    final data = {
      'customer_id': _selectedCustomerId,
      'items': sel.map((p) => {'product_id': p['id'], 'quantity': p['qty']}).toList(),
      'notes': 'Salesman order',
      'delivery_address': 'Karachi',
    };

    if (!_isOnline) {
      await HiveService.saveOfflineOrder(data);
      setState(() {
        _pendingSync = HiveService.getOfflineOrderCount();
        _isSubmitting = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Saved offline — will sync when internet available'),
            backgroundColor: AppColors.orange));
        context.go('/salesman-dashboard');
      }
      return;
    }

    try {
      final res = await DioClient.instance.post(ApiEndpoints.orders, data: data);
      if (res.data['success'] == true) {
        if (mounted) {
          await showSuccessCheck(context, message: 'Order Placed!');
          if (mounted) context.go('/salesman-dashboard');
        }
      }
    } catch (e) {
      await HiveService.saveOfflineOrder(data);
      setState(() {
        _isOnline = false;
        _pendingSync = HiveService.getOfflineOrderCount();
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('No internet — saved offline'),
            backgroundColor: AppColors.orange));
        context.go('/salesman-dashboard');
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
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
            onPressed: () => goBack(context, '/salesman-dashboard')),
        title: const Text('Create Order',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 8),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
                color: _isOnline
                    ? AppColors.success.withValues(alpha: 0.2)
                    : AppColors.error.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: _isOnline ? AppColors.success : AppColors.error)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(_isOnline ? Icons.wifi : Icons.wifi_off,
                  size: 14, color: _isOnline ? AppColors.success : AppColors.error),
              const SizedBox(width: 4),
              Text(_isOnline ? 'Online' : 'Offline',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: _isOnline ? AppColors.success : AppColors.error)),
            ]),
          )
        ],
      ),
      body: Column(children: [
        if (_pendingSync > 0)
          GestureDetector(
            onTap: _isOnline ? _syncNow : null,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: AppColors.orange.withValues(alpha: 0.15),
              child: Row(children: [
                const Icon(Icons.sync, color: AppColors.orange, size: 18),
                const SizedBox(width: 8),
                Text('$_pendingSync orders pending sync',
                    style: const TextStyle(color: AppColors.orange, fontWeight: FontWeight.bold)),
                const Spacer(),
                if (_isOnline)
                  const Text('Tap to sync', style: TextStyle(color: AppColors.orange, fontSize: 12)),
              ]),
            ),
          ),
        Container(
          color: AppColors.white,
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Select Customer',
                style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 13)),
            const SizedBox(height: 8),
            if (_isLoading)
              const LinearProgressIndicator(color: AppColors.orange)
            else if (_selectedCustomer != null && (_selectedCustomer!['id'] != null))
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                    color: AppColors.orange.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.orange)),
                child: Row(children: [
                  const Icon(Icons.business, color: AppColors.orange, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(_selectedCustomer!['full_name'] ?? _selectedCustomer!['name'] ?? '',
                        style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy)),
                  ),
                  GestureDetector(
                    onTap: () => setState(() {
                      _selectedCustomerId = null;
                      _customerSearchController.clear();
                    }),
                    child: const Icon(Icons.close, color: AppColors.steelBlue, size: 18),
                  ),
                ]),
              )
            else ...[
              TextField(
                controller: _customerSearchController,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                    hintText: 'Search customer by name or phone...',
                    prefixIcon: const Icon(Icons.search, color: AppColors.steelBlue),
                    filled: true,
                    fillColor: AppColors.warmGrey,
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12)),
              ),
              if (_customerSearchController.text.trim().isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(top: 6),
                  constraints: const BoxConstraints(maxHeight: 220),
                  decoration: BoxDecoration(
                      color: AppColors.warmGrey, borderRadius: BorderRadius.circular(10)),
                  child: _filteredCustomers.isEmpty
                      ? const Padding(
                          padding: EdgeInsets.all(14),
                          child: Text('No matching customers.', style: TextStyle(color: AppColors.steelBlue)))
                      : ListView.builder(
                          shrinkWrap: true,
                          itemCount: _filteredCustomers.length,
                          itemBuilder: (_, i) {
                            final c = _filteredCustomers[i];
                            return ListTile(
                              dense: true,
                              title: Text(c['full_name'] ?? c['name'] ?? '',
                                  style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.navy, fontSize: 13)),
                              subtitle: Text(c['phone'] ?? '', style: const TextStyle(fontSize: 11)),
                              onTap: () => setState(() {
                                _selectedCustomerId = c['id'] as String;
                                _customerSearchController.text = c['full_name'] ?? c['name'] ?? '';
                              }),
                            );
                          },
                        ),
                ),
            ],
          ]),
        ),
        if (!_isLoading && _categories.isNotEmpty)
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              children: [
                _categoryChip(null, 'All'),
                ..._categories.map((c) => _categoryChip(c['id'] as String, c['name'] ?? '')),
              ],
            ),
          ),
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: _filteredProducts.length,
                  itemBuilder: (_, i) {
                    final allIndex = _products.indexOf(_filteredProducts[i]);
                    final p = _filteredProducts[i];
                    final qty = (p['qty'] ?? 0) as int;
                    final price = ((p['price'] ?? 0) as num).toDouble();
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                          color: AppColors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: qty > 0 ? Border.all(color: AppColors.orange, width: 1.5) : null,
                          boxShadow: [
                            BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 6)
                          ]),
                      child: Row(children: [
                        Container(
                          width: 50,
                          height: 50,
                          decoration: BoxDecoration(
                              color: AppColors.warmGrey, borderRadius: BorderRadius.circular(8)),
                          child: p['image_url'] != null
                              ? ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Image.network(p['image_url'],
                                      fit: BoxFit.cover,
                                      errorBuilder: (c, e, s) => const Icon(
                                          Icons.inventory_2_outlined,
                                          color: AppColors.steelBlue)))
                              : const Icon(Icons.inventory_2_outlined, color: AppColors.steelBlue),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(p['name'] ?? '',
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 13)),
                            Text('PKR ${price.toStringAsFixed(0)}',
                                style: const TextStyle(color: AppColors.orange, fontSize: 12)),
                          ]),
                        ),
                        Row(children: [
                          GestureDetector(
                            onTap: () => setState(() {
                              if (qty > 0) _products[allIndex]['qty'] = qty - 1;
                            }),
                            child: Container(
                              width: 30,
                              height: 30,
                              decoration: BoxDecoration(
                                  color: AppColors.warmGrey, borderRadius: BorderRadius.circular(6)),
                              child: const Icon(Icons.remove, size: 16, color: AppColors.navy),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            child: Text('$qty',
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 16)),
                          ),
                          GestureDetector(
                            onTap: () => setState(() => _products[allIndex]['qty'] = qty + 1),
                            child: Container(
                              width: 30,
                              height: 30,
                              decoration: BoxDecoration(
                                  color: AppColors.orange, borderRadius: BorderRadius.circular(6)),
                              child: const Icon(Icons.add, size: 16, color: Colors.white),
                            ),
                          ),
                        ]),
                      ]),
                    );
                  }),
        ),
        if (_total > 0)
          Container(
            padding: const EdgeInsets.all(16),
            color: AppColors.white,
            child: RHRButton(
                text: _isOnline ? 'Place Order — PKR $_total' : 'Save Offline — PKR $_total',
                onPressed: _submit,
                isLoading: _isSubmitting),
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
}
