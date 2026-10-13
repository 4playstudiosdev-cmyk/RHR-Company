import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/router/app_transitions.dart';

/// A single order the driver is out to deliver — items, shop name, the
/// customer's saved shop location on a map, and the two actions that end
/// the delivery run for this order: Mark as Delivered (asks how many
/// bags actually went out vs came back damaged/returned) or Cancel
/// (marks it undelivered — admin sees this on their dashboard).
class DriverOrderDetailScreen extends StatefulWidget {
  final String? orderId;
  const DriverOrderDetailScreen({super.key, this.orderId});

  @override
  State<DriverOrderDetailScreen> createState() => _DriverOrderDetailScreenState();
}

class _DriverOrderDetailScreenState extends State<DriverOrderDetailScreen> {
  bool _loading = true;
  bool _acting = false;
  String? _error;
  Map<String, dynamic>? _order;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (widget.orderId == null) {
      setState(() { _loading = false; _error = 'No order selected'; });
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final res = await DioClient.instance.get('${ApiEndpoints.orders}/${widget.orderId}');
      if (res.data['success'] == true) {
        setState(() => _order = res.data['data'] as Map<String, dynamic>);
      } else {
        setState(() => _error = res.data['message'] ?? 'Failed to load order');
      }
    } catch (e) {
      setState(() => _error = 'Failed to load order');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submitStatus(String status, {int? delivered, int? returned, String? notes}) async {
    setState(() => _acting = true);
    try {
      final res = await DioClient.instance.patch(
        '${ApiEndpoints.orders}/${widget.orderId}/driver-status',
        data: {
          'status': status,
          if (delivered != null) 'delivered_bags': delivered,
          if (returned != null) 'returned_bags': returned,
          if (notes != null && notes.isNotEmpty) 'delivery_notes': notes,
        },
      );
      if (res.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(status == 'delivered' ? 'Order marked as delivered' : 'Order marked as undelivered'),
              backgroundColor: status == 'delivered' ? AppColors.success : AppColors.orange));
          Navigator.of(context).pop();
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(res.data['message'] ?? 'Failed to update order')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  Future<void> _confirmCancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Cancel Delivery?'),
        content: const Text('This order will be marked as undelivered and the admin will be notified.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('No')),
          TextButton(onPressed: () => Navigator.pop(c, true),
              child: const Text('Yes, Cancel', style: TextStyle(color: AppColors.error))),
        ],
      ),
    );
    if (confirmed == true) await _submitStatus('undelivered');
  }

  Future<void> _confirmDelivered() async {
    final totalBags = (List<Map<String, dynamic>>.from(_order?['order_items'] ?? []))
        .fold<num>(0, (s, it) => s + ((it['quantity'] as num?) ?? 0));
    final deliveredController = TextEditingController(text: totalBags.toInt().toString());
    final returnedController = TextEditingController(text: '0');
    final notesController = TextEditingController();

    final result = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Confirm Delivery'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('How many bags/items were delivered, and how many returned (damaged or not accepted)?',
              style: TextStyle(fontSize: 13)),
          const SizedBox(height: 16),
          TextField(
            controller: deliveredController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Delivered', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: returnedController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Returned / Damaged', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: notesController,
            decoration: const InputDecoration(labelText: 'Notes (optional)', border: OutlineInputBorder()),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(c, true), child: const Text('Confirm')),
        ],
      ),
    );

    if (result == true) {
      await _submitStatus(
        'delivered',
        delivered: int.tryParse(deliveredController.text) ?? 0,
        returned: int.tryParse(returnedController.text) ?? 0,
        notes: notesController.text.trim(),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: () => goBack(context, '/driver-orders')),
        title: Text(_order?['order_number'] ?? 'Order', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: AppColors.steelBlue)))
              : _buildBody(),
    );
  }

  Widget _buildBody() {
    final order = _order!;
    final customer = order['users'] as Map<String, dynamic>? ?? {};
    final items = List<Map<String, dynamic>>.from(order['order_items'] ?? []);
    final lat = customer['shop_latitude'];
    final lng = customer['shop_longitude'];
    final hasLocation = lat != null && lng != null;

    return Column(children: [
      Expanded(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(16),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)]),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Icon(Icons.storefront, color: AppColors.orange),
                  const SizedBox(width: 10),
                  Expanded(child: Text(customer['shop_name'] ?? customer['full_name'] ?? 'Customer',
                      style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 16))),
                ]),
                const SizedBox(height: 6),
                Text(customer['full_name'] ?? '', style: const TextStyle(color: AppColors.steelBlue, fontSize: 13)),
                if (customer['phone'] != null) Text(customer['phone'], style: const TextStyle(color: AppColors.steelBlue, fontSize: 13)),
                Text(order['delivery_address'] ?? customer['shop_address'] ?? '', style: const TextStyle(color: AppColors.steelBlue, fontSize: 13)),
              ]),
            ),
            const SizedBox(height: 14),
            if (hasLocation) ...[
              const Text('Shop Location', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 14)),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: SizedBox(
                  height: 220,
                  child: FlutterMap(
                    options: MapOptions(
                      initialCenter: LatLng((lat as num).toDouble(), (lng as num).toDouble()),
                      initialZoom: 15,
                      interactionOptions: const InteractionOptions(flags: InteractiveFlag.all),
                    ),
                    children: [
                      TileLayer(
                        urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        subdomains: const ['a', 'b', 'c'],
                        userAgentPackageName: 'com.rhr.company.app',
                      ),
                      MarkerLayer(markers: [
                        Marker(
                          point: LatLng(lat.toDouble(), (lng).toDouble()),
                          width: 40, height: 40,
                          child: const Icon(Icons.location_on, color: AppColors.error, size: 36),
                        ),
                      ]),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
            ],
            const Text('Order Items', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 14)),
            const SizedBox(height: 8),
            Container(
              decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(16),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)]),
              child: Column(children: items.map((item) {
                return ListTile(
                  leading: const Icon(Icons.inventory_2_outlined, color: AppColors.orange),
                  title: Text(item['product_name'] ?? '', style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w600)),
                  trailing: Text('x${item['quantity']}', style: const TextStyle(color: AppColors.steelBlue, fontWeight: FontWeight.bold)),
                );
              }).toList()),
            ),
          ],
        ),
      ),
      Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(color: AppColors.white, boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 8)]),
        child: Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: _acting ? null : _confirmCancel,
              style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.error, side: const BorderSide(color: AppColors.error),
                  padding: const EdgeInsets.symmetric(vertical: 14)),
              icon: const Icon(Icons.close),
              label: const Text('Cancel'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: ElevatedButton.icon(
              onPressed: _acting ? null : _confirmDelivered,
              style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.success, foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14)),
              icon: _acting
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.check),
              label: const Text('Mark as Delivered'),
            ),
          ),
        ]),
      ),
    ]);
  }
}
