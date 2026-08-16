import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/hive_service.dart';
import '../../../core/storage/sync_service.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/success_check.dart';

class CreateOrderScreen extends StatefulWidget {
  const CreateOrderScreen({super.key});

  @override
  State<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends State<CreateOrderScreen> {
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _customers = [];
  String? _selectedCustomerId;
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

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final pRes = await DioClient.instance.get(
          ApiEndpoints.products, queryParameters: {'limit': 50});
      final cRes = await DioClient.instance.get(ApiEndpoints.customers);
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
      });
    } catch (e) {
      setState(() => _isOnline = false);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

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
            onPressed: () => context.go('/salesman-dashboard')),
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
            _isLoading
                ? const LinearProgressIndicator(color: AppColors.orange)
                : DropdownButtonFormField<String>(
                    initialValue: _selectedCustomerId,
                    hint: const Text('Choose customer...'),
                    decoration: InputDecoration(
                        filled: true,
                        fillColor: AppColors.warmGrey,
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                        contentPadding:
                            const EdgeInsets.symmetric(horizontal: 16, vertical: 12)),
                    items: _customers
                        .map((c) => DropdownMenuItem(
                            value: c['id'] as String,
                            child: Text(c['full_name'] ?? c['name'] ?? '')))
                        .toList(),
                    onChanged: (v) => setState(() => _selectedCustomerId = v)),
          ]),
        ),
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: _products.length,
                  itemBuilder: (_, i) {
                    final p = _products[i];
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
                              if (qty > 0) _products[i]['qty'] = qty - 1;
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
                            onTap: () => setState(() => _products[i]['qty'] = qty + 1),
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
}
