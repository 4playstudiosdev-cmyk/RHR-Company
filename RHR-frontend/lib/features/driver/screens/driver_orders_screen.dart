import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/router/app_transitions.dart';
import '../../../shared/widgets/staggered_fade_in.dart';

/// Every order currently dispatched to this driver — the backend already
/// scopes GET /orders to driver_id = self + status = 'dispatched' (see
/// orders.service.js's getOrders), so once an order is marked delivered
/// or undelivered it simply drops off this list on its own.
class DriverOrdersScreen extends StatefulWidget {
  const DriverOrdersScreen({super.key});

  @override
  State<DriverOrdersScreen> createState() => _DriverOrdersScreenState();
}

class _DriverOrdersScreenState extends State<DriverOrdersScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _orders = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await DioClient.instance.get(ApiEndpoints.orders);
      if (res.data['success'] == true) {
        setState(() => _orders = List<Map<String, dynamic>>.from(res.data['data'] ?? []));
      } else {
        setState(() => _error = res.data['message'] ?? 'Failed to load orders');
      }
    } catch (e) {
      setState(() => _error = 'Failed to load orders');
    } finally {
      if (mounted) setState(() => _loading = false);
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
          onPressed: () => goBack(context, '/driver-dashboard'),
        ),
        title: const Text('My Deliveries', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _load)],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
            : _error != null
                ? Center(child: Text(_error!, style: const TextStyle(color: AppColors.steelBlue)))
                : _orders.isEmpty
                    ? ListView(children: const [
                        Padding(
                          padding: EdgeInsets.all(40),
                          child: Center(
                            child: Text('No deliveries assigned to you right now.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: AppColors.steelBlue, fontSize: 14)),
                          ),
                        ),
                      ])
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _orders.length,
                        itemBuilder: (context, i) {
                          final o = _orders[i];
                          final items = List<Map<String, dynamic>>.from(o['order_items'] ?? []);
                          final itemCount = items.length;
                          return StaggeredFadeIn(
                            index: i,
                            child: Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(16),
                                onTap: () async {
                                  await context.push('/driver-order-detail', extra: o['id'] as String?);
                                  _load();
                                },
                                child: Container(
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: AppColors.white,
                                    borderRadius: BorderRadius.circular(16),
                                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
                                  ),
                                  child: Row(children: [
                                    Container(
                                      padding: const EdgeInsets.all(10),
                                      decoration: BoxDecoration(
                                        color: AppColors.orange.withValues(alpha: 0.12),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: const Icon(Icons.local_shipping_outlined, color: AppColors.orange),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                        Text(o['order_number'] ?? '—',
                                            style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 14)),
                                        const SizedBox(height: 2),
                                        Text(o['users']?['full_name'] ?? o['users']?['shop_name'] ?? 'Customer',
                                            style: const TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                                        const SizedBox(height: 2),
                                        Text('$itemCount item(s) — PKR ${_asNum(o['total_amount']).toStringAsFixed(0)}',
                                            style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
                                      ]),
                                    ),
                                    const Icon(Icons.arrow_forward_ios, size: 14, color: AppColors.steelBlue),
                                  ]),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}

num _asNum(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '0') ?? 0;
