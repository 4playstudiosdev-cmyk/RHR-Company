import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
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

  Future<void> _submitStatus(String status, {int? delivered, int? returned, String? notes, double? amountCollected}) async {
    setState(() => _acting = true);
    try {
      final res = await DioClient.instance.patch(
        '${ApiEndpoints.orders}/${widget.orderId}/driver-status',
        data: {
          'status': status,
          if (delivered != null) 'delivered_bags': delivered,
          if (returned != null) 'returned_bags': returned,
          if (notes != null && notes.isNotEmpty) 'delivery_notes': notes,
          if (amountCollected != null && amountCollected > 0) 'amount_collected': amountCollected,
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

  // Plain Google Maps web link built from the saved coordinates — no API
  // key, no billing, works whether or not Google Maps is installed
  // (opens the app directly if it is, the web client otherwise). Same
  // pattern as the "View on Google Maps" link added to the admin
  // desktop's Edit Customer panel.
  Future<void> _openInGoogleMaps(double lat, double lng) async {
    final uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$lat,$lng');
    if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
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
    final amountController = TextEditingController();
    bool receivedPayment = false;

    final result = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, setDialogState) => AlertDialog(
          title: const Text('Confirm Delivery'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
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
              const SizedBox(height: 16),
              const Divider(),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Received payment from customer?', style: TextStyle(fontSize: 14)),
                value: receivedPayment,
                onChanged: (v) => setDialogState(() => receivedPayment = v),
                activeTrackColor: AppColors.success,
              ),
              if (receivedPayment) ...[
                const SizedBox(height: 6),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Amount Received (PKR)', border: OutlineInputBorder()),
                ),
              ],
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(c, true), child: const Text('Confirm')),
          ],
        ),
      ),
    );

    if (result == true) {
      await _submitStatus(
        'delivered',
        delivered: int.tryParse(deliveredController.text) ?? 0,
        returned: int.tryParse(returnedController.text) ?? 0,
        notes: notesController.text.trim(),
        amountCollected: receivedPayment ? double.tryParse(amountController.text.trim()) : null,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: () => goBack(context, '/driver-dashboard')),
        title: Text(_order?['order_number'] ?? 'Order', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20)),
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
    final photoUrl = customer['profile_photo_url'] as String?;
    final isActive = order['status'] == 'dispatched';
    final isUndelivered = order['status'] == 'undelivered';
    final isUrgent = order['priority'] == 'urgent';
    final salesman = order['salesmen'] as Map<String, dynamic>?;

    return Column(children: [
      Expanded(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (isUrgent && isActive)
              const _UrgentBanner(),
            if (!isActive)
              Container(
                margin: const EdgeInsets.only(bottom: 14),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: (isUndelivered ? AppColors.orange : AppColors.success).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(children: [
                  Icon(isUndelivered ? Icons.cancel_outlined : Icons.check_circle,
                      color: isUndelivered ? AppColors.orange : AppColors.success),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      isUndelivered
                          ? 'This delivery was marked undelivered.'
                          : 'Delivered — ${order['delivered_bags'] ?? 0} bags, ${order['returned_bags'] ?? 0} returned.',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14,
                          color: isUndelivered ? AppColors.orange : AppColors.success),
                    ),
                  ),
                ]),
              ),
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(16),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)]),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: AppColors.orange.withValues(alpha: 0.12),
                  backgroundImage: (photoUrl != null && photoUrl.isNotEmpty) ? NetworkImage(photoUrl) : null,
                  child: (photoUrl == null || photoUrl.isEmpty)
                      ? const Icon(Icons.storefront, color: AppColors.orange, size: 26)
                      : null,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(customer['shop_name'] ?? customer['full_name'] ?? 'Customer',
                        style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 19)),
                    const SizedBox(height: 4),
                    Text(customer['full_name'] ?? '', style: const TextStyle(color: AppColors.steelBlue, fontSize: 15)),
                    if (customer['phone'] != null)
                      Text(customer['phone'], style: const TextStyle(color: AppColors.steelBlue, fontSize: 15)),
                    const SizedBox(height: 4),
                    Text(order['delivery_address'] ?? customer['shop_address'] ?? '',
                        style: const TextStyle(color: AppColors.steelBlue, fontSize: 14)),
                  ]),
                ),
              ]),
            ),
            if (salesman != null && (salesman['full_name'] as String?)?.isNotEmpty == true) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(14),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)]),
                child: Row(children: [
                  const Icon(Icons.badge_outlined, color: AppColors.navy, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Salesman: ${salesman['full_name']}',
                          style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.navy, fontSize: 13)),
                      if ((salesman['phone'] as String?)?.isNotEmpty == true)
                        Text(salesman['phone'], style: const TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                    ]),
                  ),
                ]),
              ),
            ],
            const SizedBox(height: 16),
            if (hasLocation) ...[
              Row(children: [
                const Text('Shop Location', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 17)),
                const Spacer(),
                TextButton.icon(
                  onPressed: () => _openInGoogleMaps((lat as num).toDouble(), (lng as num).toDouble()),
                  icon: const Icon(Icons.map_outlined, size: 18),
                  label: const Text('Open in Google Maps'),
                  style: TextButton.styleFrom(foregroundColor: AppColors.primary, padding: EdgeInsets.zero),
                ),
              ]),
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
              const SizedBox(height: 16),
            ],
            const Text('Order Items', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 17)),
            const SizedBox(height: 8),
            Container(
              decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(16),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)]),
              child: Column(children: items.map((item) {
                final imageUrl = item['products']?['image_url'] as String?;
                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  leading: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: (imageUrl != null && imageUrl.isNotEmpty)
                        ? Image.network(imageUrl, width: 46, height: 46, fit: BoxFit.cover,
                            errorBuilder: (c, e, s) => _itemFallback())
                        : _itemFallback(),
                  ),
                  title: Text(item['product_name'] ?? '',
                      style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w600, fontSize: 16)),
                  trailing: Text('x${item['quantity']}',
                      style: const TextStyle(color: AppColors.steelBlue, fontWeight: FontWeight.bold, fontSize: 16)),
                );
              }).toList()),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
      if (isActive)
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
                label: const Text('Cancel', style: TextStyle(fontWeight: FontWeight.w600)),
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
                label: const Text('Mark as Delivered', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
          ]),
        ),
    ]);
  }

  Widget _itemFallback() {
    return Container(
      width: 46, height: 46,
      color: AppColors.orange.withValues(alpha: 0.12),
      child: const Icon(Icons.inventory_2_outlined, color: AppColors.orange, size: 22),
    );
  }
}

/// Blinking "URGENT" banner — a flat priority label wasn't attention-
/// grabbing enough for a delivery that's supposed to jump the queue, so
/// this fades in/out continuously while the order is still active.
class _UrgentBanner extends StatefulWidget {
  const _UrgentBanner();

  @override
  State<_UrgentBanner> createState() => _UrgentBannerState();
}

class _UrgentBannerState extends State<_UrgentBanner> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))
      ..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: FadeTransition(
        opacity: Tween(begin: 0.4, end: 1.0).animate(_controller),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(color: AppColors.error, borderRadius: BorderRadius.circular(12)),
          child: const Row(children: [
            Icon(Icons.priority_high, color: Colors.white),
            SizedBox(width: 10),
            Text('URGENT DELIVERY', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
          ]),
        ),
      ),
    );
  }
}
