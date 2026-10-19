import 'package:flutter/material.dart';
import '../../../shared/widgets/order_in_line_dialog.dart';
import '../../../shared/widgets/qty_field.dart';
import '../../../core/storage/secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/hive_service.dart';
import '../../../core/storage/sync_service.dart';
import '../../../shared/order_qty_rules.dart';
import '../../../shared/customer_display.dart';
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
  final _customerSearchFocus = FocusNode();
  bool _isLoading = true;
  // A driver with sales access uses this screen too — their home is the driver dashboard.
  String _home = '/salesman-dashboard';
  bool _isSubmitting = false;
  bool _isOnline = true;
  int _pendingSync = 0;

  @override
  void initState() {
    super.initState();
    SecureStorage.getRole().then((r) {
      if (r == 'driver' && mounted) setState(() => _home = '/driver-dashboard');
    });
    _pendingSync = HiveService.getOfflineOrderCount();
    _loadData();
    _customerSearchFocus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _customerSearchController.dispose();
    _customerSearchFocus.dispose();
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
              .map<Map<String, dynamic>>((e) => {...Map<String, dynamic>.from(e), 'qty': 0, 'base_price': e['price']})
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

  // Prices shown while placing an order are the chosen customer's own
  // (their rate tier / custom prices), not the catalog price — the server
  // already charges the customer's rate in createOrder, so showing catalog
  // prices here meant the screen disagreed with what was actually billed.
  // Quantities already picked are kept. Offline (or on any error) the
  // catalog prices stay and the server still bills the right amount.
  Future<void> _loadCustomerPrices(String customerId) async {
    try {
      final res = await DioClient.instance.get(
          ApiEndpoints.products, queryParameters: {'limit': 50, 'customer_id': customerId});
      if (res.data['success'] != true) return;
      final d = res.data['data'];
      final list = d is List ? d : (d['products'] ?? []);
      final priceById = <dynamic, dynamic>{for (final e in list) e['id']: e['price']};
      if (!mounted || _selectedCustomerId != customerId) return;
      setState(() {
        for (final p in _products) {
          if (priceById.containsKey(p['id'])) p['price'] = priceById[p['id']];
        }
      });
    } catch (e) {
      debugPrint('Customer prices error: $e');
    }
  }

  void _resetToCatalogPrices() {
    for (final p in _products) {
      if (p.containsKey('base_price')) p['price'] = p['base_price'];
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
      final name = customerSearchText(c);
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

  int get _totalQty => _products.fold(0, (s, p) => s + ((p['qty'] ?? 0) as int));

  int get _total => _products.fold(0, (s, p) =>
      s + ((p['price'] ?? 0) as num).toInt() * ((p['qty'] ?? 0) as int));

  Future<void> _openCheckout() async {
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
    final minHint = minTotalQtyHint(_totalQty);
    if (minHint != null) {
      _showOrderRejected(minHint);
      return;
    }

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => DraggableScrollableSheet(
        initialChildSize: 0.75,
        maxChildSize: 0.9,
        minChildSize: 0.5,
        expand: false,
        builder: (_, scrollController) => Container(
          decoration: const BoxDecoration(
            color: AppColors.warmGrey,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(children: [
            Container(
              margin: const EdgeInsets.symmetric(vertical: 10),
              width: 40, height: 4,
              decoration: BoxDecoration(color: AppColors.steelBlue.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(2)),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: Align(alignment: Alignment.centerLeft,
                  child: Text('Review Order', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 18))),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: ListView(
                controller: scrollController,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                children: [
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(12)),
                    child: Row(children: [
                      const Icon(Icons.business, color: AppColors.orange, size: 18),
                      const SizedBox(width: 10),
                      Expanded(child: Text(customerTitle(_selectedCustomer, fallback: ''),
                          style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy))),
                    ]),
                  ),
                  const SizedBox(height: 12),
                  ...sel.map((p) => Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(10)),
                        child: Row(children: [
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(p['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.navy, fontSize: 13)),
                              Text('${p['qty']} × PKR ${((p['price'] ?? 0) as num).toStringAsFixed(0)}',
                                  style: const TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                            ]),
                          ),
                          Text('PKR ${(((p['price'] ?? 0) as num) * (p['qty'] as int)).toStringAsFixed(0)}',
                              style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 13)),
                        ]),
                      )),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(12)),
                    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      const Text('Total', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w600)),
                      Text('PKR $_total', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                    ]),
                  ),
                  const SizedBox(height: 20),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: RHRButton(
                text: _isOnline ? 'Confirm & Place Order' : 'Confirm & Save Offline',
                onPressed: () => Navigator.of(sheetContext).pop(true),
              ),
            ),
          ]),
        ),
      ),
    );

    if (confirmed == true) await _submit();
  }

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
        context.go(_home);
      }
      return;
    }

    try {
      final res = await DioClient.instance.post(ApiEndpoints.orders, data: data);
      if (res.data['success'] == true) {
        if (mounted) {
          await showSuccessCheck(context, message: 'Order Placed!');
          if (mounted) context.go(_home);
        }
      } else if (mounted) {
        // 4xx answers (already one order in line, credit limit, stock, minimum
        // quantity...) come back as a normal response, not an exception.
        if (isOrderInLineData(res.data)) {
          await showOrderInLineDialog(context, forCustomer: false);
        } else {
          _showOrderRejected((res.data is Map ? res.data['message'] : null)?.toString() ?? 'Order could not be placed.');
        }
      }
    } on DioException catch (e) {
      // The backend reached us and actively rejected the order (e.g. this
      // customer already has one in progress, below their credit limit,
      // insufficient stock...) — a real answer, not a connectivity
      // problem. Queuing it offline would have silently hidden that
      // rejection and kept retrying a submission doomed to fail every
      // time, so this must surface loudly instead.
      if (e.response != null) {
        if (isOrderInLine(e)) {
          if (mounted) await showOrderInLineDialog(context, forCustomer: false);
          return;
        }
        final msg = e.response?.data?['message'] as String? ?? 'Order could not be placed.';
        if (mounted) _showOrderRejected(msg);
      } else {
        await HiveService.saveOfflineOrder(data);
        setState(() {
          _isOnline = false;
          _pendingSync = HiveService.getOfflineOrderCount();
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('No internet — saved offline'),
              backgroundColor: AppColors.orange));
          context.go(_home);
        }
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  void _showOrderRejected(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: AppColors.error,
        duration: const Duration(seconds: 5),
        content: Row(children: [
          const Icon(Icons.error_outline, color: Colors.white),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600))),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => goBack(context, _home)),
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
                    child: Text(customerTitle(_selectedCustomer, fallback: ''),
                        style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy)),
                  ),
                  GestureDetector(
                    onTap: () => setState(() {
                      _selectedCustomerId = null;
                      _customerSearchController.clear();
                      _resetToCatalogPrices();
                    }),
                    child: const Icon(Icons.close, color: AppColors.steelBlue, size: 18),
                  ),
                ]),
              )
            else ...[
              TextField(
                controller: _customerSearchController,
                focusNode: _customerSearchFocus,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                    hintText: 'Tap to see all customers, or search by name/phone...',
                    prefixIcon: const Icon(Icons.search, color: AppColors.steelBlue),
                    filled: true,
                    fillColor: AppColors.warmGrey,
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12)),
              ),
              if (_customerSearchFocus.hasFocus || _customerSearchController.text.trim().isNotEmpty)
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
                              title: Text(customerTitle(c, fallback: ''),
                                  style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.navy, fontSize: 13)),
                              subtitle: Text(c['phone'] ?? '', style: const TextStyle(fontSize: 11)),
                              onTap: () {
                                _customerSearchFocus.unfocus();
                                setState(() {
                                  _selectedCustomerId = c['id'] as String;
                                  _customerSearchController.text = customerTitle(c, fallback: '');
                                  _resetToCatalogPrices();
                                });
                                _loadCustomerPrices(c['id'] as String);
                              },
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
                    final qtyRule = qtyRuleForProduct(p);
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
                              _products[allIndex]['qty'] = qty - qtyRule.step < 1 ? 0 : qty - qtyRule.step;
                            }),
                            child: Container(
                              width: 30,
                              height: 30,
                              decoration: BoxDecoration(
                                  color: AppColors.warmGrey, borderRadius: BorderRadius.circular(6)),
                              child: const Icon(Icons.remove, size: 16, color: AppColors.navy),
                            ),
                          ),
                          QtyField(
                            value: qty,
                            width: 50,
                            borderColor: AppColors.orange,
                            style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 16),
                            onChanged: (v) => setState(() => _products[allIndex]['qty'] = v < 0 ? 0 : v),
                          ),
                          GestureDetector(
                            onTap: () => setState(() =>
                                _products[allIndex]['qty'] = qty == 0 ? qtyRule.step : qty + qtyRule.step),
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
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  minTotalQtyHint(_totalQty) ?? 'Total quantity: $_totalQty',
                  style: TextStyle(
                      color: minTotalQtyHint(_totalQty) != null ? AppColors.error : AppColors.steelBlue,
                      fontWeight: FontWeight.w600,
                      fontSize: 12.5),
                ),
              ),
              RHRButton(
                  text: 'Review & Checkout — PKR $_total',
                  onPressed: _openCheckout,
                  isLoading: _isSubmitting),
            ]),
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
