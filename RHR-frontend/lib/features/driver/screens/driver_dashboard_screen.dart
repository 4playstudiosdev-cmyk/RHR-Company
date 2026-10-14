import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../services/gps_service.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';

class DriverDashboardScreen extends StatefulWidget {
  const DriverDashboardScreen({super.key});

  @override
  State<DriverDashboardScreen> createState() => _DriverDashboardScreenState();
}

class _DriverDashboardScreenState extends State<DriverDashboardScreen> {
  String _name = 'Driver';
  String _carNumber = '';
  String _driverId = '';

  bool _ordersLoading = true;
  List<Map<String, dynamic>> _toDeliver = [];
  List<Map<String, dynamic>> _delivered = [];

  @override
  void initState() {
    super.initState();
    _loadProfile();
    _loadOrders();
  }

  Future<void> _loadProfile() async {
    final name = await SecureStorage.getFullName();
    final carNumber = await SecureStorage.getCarNumber();
    final userId = await SecureStorage.getUserId();
    if (!mounted) return;
    setState(() {
      if (name != null && name.isNotEmpty) _name = name;
      if (carNumber != null && carNumber.isNotEmpty) _carNumber = carNumber;
      if (userId != null && userId.length >= 8) {
        _driverId = 'DRV-${userId.substring(0, 8).toUpperCase()}';
      }
    });
  }

  // Backend scopes GET /orders to driver_id=self + status in
  // (dispatched, delivered, undelivered) for a driver — split here into
  // "still to deliver" vs "already completed" so the completed panel
  // (the user's "Successfully Delivered" section) is a client-side group,
  // not a second request.
  Future<void> _loadOrders() async {
    setState(() => _ordersLoading = true);
    try {
      final res = await DioClient.instance.get(ApiEndpoints.orders);
      if (res.data['success'] == true) {
        final orders = List<Map<String, dynamic>>.from(res.data['data'] ?? []);
        setState(() {
          _toDeliver = orders.where((o) => o['status'] == 'dispatched').toList();
          _delivered = orders.where((o) => o['status'] == 'delivered' || o['status'] == 'undelivered').toList();
        });
      }
    } catch (e) {
      debugPrint('Driver orders load error: $e');
    } finally {
      if (mounted) setState(() => _ordersLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isTracking = GPSService().isTracking;
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      drawer: _buildDrawer(context),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _loadOrders,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: Column(
              children: [
                // Header
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: const BoxDecoration(
                    color: AppColors.navy,
                    borderRadius: BorderRadius.only(
                      bottomLeft: Radius.circular(28),
                      bottomRight: Radius.circular(28),
                    ),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Builder(
                            builder: (ctx) => GestureDetector(
                              onTap: () => Scaffold.of(ctx).openDrawer(),
                              child: Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.1),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.menu, color: Colors.white),
                              ),
                            ),
                          ),
                          Expanded(
                            child: GestureDetector(
                              onTap: () => context.push('/driver-profile'),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.center,
                                children: [
                                  const Text('Welcome,',
                                      style: TextStyle(color: Colors.white70, fontSize: 13)),
                                  Text(_name,
                                      style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 20,
                                          fontWeight: FontWeight.bold)),
                                ],
                              ),
                            ),
                          ),
                          GestureDetector(
                            onTap: () => context.push('/notifications'),
                            child: Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.1),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.notifications_outlined, color: Colors.white),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      Row(
                        children: [
                          Expanded(child: StaggeredFadeIn(index: 0, child: _infoCard(
                              Icons.badge_outlined, 'Driver ID', _driverId.isEmpty ? '—' : _driverId))),
                          const SizedBox(width: 12),
                          Expanded(child: StaggeredFadeIn(index: 1, child: _infoCard(
                              Icons.directions_car_outlined, 'Car Number', _carNumber.isEmpty ? '—' : _carNumber))),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // GPS status strip
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: StaggeredFadeIn(index: 2, child: TapScale(
                    onTap: () => context.push('/driver-gps-tracking'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: isTracking ? AppColors.success.withValues(alpha: 0.1) : AppColors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: isTracking ? AppColors.success : AppColors.outlineVariant),
                      ),
                      child: Row(
                        children: [
                          Icon(isTracking ? Icons.location_on : Icons.location_off,
                              color: isTracking ? AppColors.success : AppColors.disabled, size: 20),
                          const SizedBox(width: 10),
                          Text(isTracking ? 'GPS Active' : 'GPS Inactive',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13,
                                  color: isTracking ? AppColors.success : AppColors.navy)),
                          const Spacer(),
                          const Icon(Icons.arrow_forward_ios, size: 12, color: AppColors.steelBlue),
                        ],
                      ),
                    ),
                  )),
                ),
                const SizedBox(height: 20),

                _sectionHeader('To Deliver', _toDeliver.length, AppColors.orange),
                const SizedBox(height: 10),
                _ordersLoading
                    ? const Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator(color: AppColors.orange))
                    : _toDeliver.isEmpty
                        ? _emptyRow('No deliveries assigned right now.')
                        : Column(children: _toDeliver.asMap().entries.map((e) => _orderCard(e.value, e.key, false)).toList()),

                const SizedBox(height: 24),
                _sectionHeader('Successfully Delivered', _delivered.length, AppColors.success),
                const SizedBox(height: 10),
                _ordersLoading
                    ? const SizedBox.shrink()
                    : _delivered.isEmpty
                        ? _emptyRow('Nothing delivered yet today.')
                        : Column(children: _delivered.asMap().entries.map((e) => _orderCard(e.value, e.key, true)).toList()),

                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Drawer _buildDrawer(BuildContext context) {
    return Drawer(
      backgroundColor: AppColors.warmGrey,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              child: Row(children: [
                const CircleAvatar(
                  radius: 24,
                  backgroundColor: AppColors.orange,
                  child: Icon(Icons.local_shipping_outlined, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_name, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 15)),
                    const Text('Driver', style: TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                  ]),
                ),
              ]),
            ),
            const Divider(height: 1),
            _drawerItem(context, Icons.location_on_outlined, 'GPS Tracking', '/driver-gps-tracking'),
            _drawerItem(context, Icons.person_outline, 'My Profile', '/driver-profile'),
            _drawerItem(context, Icons.account_balance_wallet_outlined, 'Cash Collection', '/driver-cash-collection'),
            _drawerItem(context, Icons.groups_outlined, 'All Salesmen', '/driver-salesmen-directory'),
            _drawerItem(context, Icons.notifications_outlined, 'Notifications', '/notifications'),
          ],
        ),
      ),
    );
  }

  Widget _drawerItem(BuildContext context, IconData icon, String label, String route) {
    return ListTile(
      leading: Icon(icon, color: AppColors.orange),
      title: Text(label, style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w600)),
      onTap: () {
        Navigator.of(context).pop();
        context.push(route);
      },
    );
  }

  Widget _sectionHeader(String title, int count, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(children: [
        Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.navy)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
          child: Text('$count', style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 12)),
        ),
      ]),
    );
  }

  Widget _emptyRow(String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(14)),
        child: Text(text, style: const TextStyle(color: AppColors.steelBlue, fontSize: 13)),
      ),
    );
  }

  Widget _orderCard(Map<String, dynamic> o, int index, bool delivered) {
    final items = List<Map<String, dynamic>>.from(o['order_items'] ?? []);
    final firstImage = items.isNotEmpty ? (items.first['products']?['image_url'] as String?) : null;
    final customer = o['users'] as Map<String, dynamic>? ?? {};
    final isUndelivered = o['status'] == 'undelivered';

    return StaggeredFadeIn(
      index: index,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (!delivered && o['priority'] == 'urgent')
              Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: AppColors.error, borderRadius: BorderRadius.circular(20)),
                child: const Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.priority_high, color: Colors.white, size: 13),
                  SizedBox(width: 4),
                  Text('URGENT', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11)),
                ]),
              ),
            Row(children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: firstImage != null && firstImage.isNotEmpty
                    ? Image.network(firstImage, width: 52, height: 52, fit: BoxFit.cover,
                        errorBuilder: (c, e, s) => _productFallback())
                    : _productFallback(),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(o['order_number'] ?? '—',
                      style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 15)),
                  const SizedBox(height: 2),
                  Text(customer['full_name'] ?? 'Customer',
                      style: const TextStyle(color: AppColors.steelBlue, fontSize: 13)),
                  Text('${items.length} item(s) — PKR ${_asNum(o['total_amount']).toStringAsFixed(0)}',
                      style: const TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                ]),
              ),
              if (customer['profile_photo_url'] != null)
                Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: CircleAvatar(radius: 18, backgroundImage: NetworkImage(customer['profile_photo_url'])),
                ),
            ]),
            if (delivered) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: (isUndelivered ? AppColors.orange : AppColors.success).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(isUndelivered ? Icons.cancel_outlined : Icons.check_circle,
                      size: 14, color: isUndelivered ? AppColors.orange : AppColors.success),
                  const SizedBox(width: 6),
                  Text(isUndelivered ? 'Undelivered' : 'Delivered — ${o['delivered_bags'] ?? 0} bags',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold,
                          color: isUndelivered ? AppColors.orange : AppColors.success)),
                ]),
              ),
            ],
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () async {
                  await context.push('/driver-order-detail', extra: o['id'] as String?);
                  _loadOrders();
                },
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.navy,
                  side: const BorderSide(color: AppColors.navy),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                icon: const Icon(Icons.visibility_outlined, size: 16),
                label: const Text('View Detail', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _productFallback() {
    return Container(
      width: 52, height: 52,
      decoration: BoxDecoration(color: AppColors.orange.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
      child: const Icon(Icons.inventory_2_outlined, color: AppColors.orange),
    );
  }

  Widget _infoCard(IconData icon, String label, String value) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white24),
      ),
      child: Column(
        children: [
          Icon(icon, color: AppColors.orange, size: 20),
          const SizedBox(height: 6),
          Text(value,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
              overflow: TextOverflow.ellipsis),
          Text(label, style: const TextStyle(color: Colors.white60, fontSize: 10)),
        ],
      ),
    );
  }
}

num _asNum(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '0') ?? 0;
