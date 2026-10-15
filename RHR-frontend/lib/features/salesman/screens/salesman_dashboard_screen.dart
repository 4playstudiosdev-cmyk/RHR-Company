import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';

class SalesmanDashboardScreen extends StatefulWidget {
  const SalesmanDashboardScreen({super.key});

  @override
  State<SalesmanDashboardScreen> createState() => _SalesmanDashboardScreenState();
}

class _SalesmanDashboardScreenState extends State<SalesmanDashboardScreen> {
  int _ordersToday        = 0;
  final String _paymentsCollected = 'PKR 0';
  int _customersVisited   = 0;
  List<Map<String, dynamic>> _myCustomers = [];
  List<Map<String, dynamic>> _myOrders = [];
  bool _isLoading = true;
  String _salesmanName = 'Salesman';
  String _salesmanPhone = '';
  String _salesmanPosition = '';

  @override
  void initState() {
    super.initState();
    _loadDashboard();
    _loadName();
  }

  Future<void> _loadName() async {
    final name     = await SecureStorage.getFullName();
    final phone    = await SecureStorage.getPhone();
    final position = await SecureStorage.getPosition();
    if (!mounted) return;
    setState(() {
      if (name != null && name.isNotEmpty) _salesmanName = name;
      if (phone != null && phone.isNotEmpty) _salesmanPhone = phone;
      if (position != null && position.isNotEmpty) _salesmanPosition = position;
    });
  }

  void _showProfilePopup() {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            CircleAvatar(
              radius: 36,
              backgroundColor: AppColors.orange,
              child: Text(
                _salesmanName.isNotEmpty ? _salesmanName[0].toUpperCase() : 'S',
                style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 14),
            Text(_salesmanName,
                style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 18)),
            if (_salesmanPosition.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(_salesmanPosition,
                  style: const TextStyle(color: AppColors.orange, fontWeight: FontWeight.w600, fontSize: 13)),
            ],
            if (_salesmanPhone.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(_salesmanPhone, style: const TextStyle(color: AppColors.steelBlue, fontSize: 13)),
            ],
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () {
                  Navigator.of(context).pop();
                  context.push('/salesman-profile');
                },
                child: const Text('View Full Profile',
                    style: TextStyle(color: AppColors.navy, fontWeight: FontWeight.bold)),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Future<void> _loadDashboard() async {
    try {
      // Load customers (RLS ensures salesman sees own only)
      final custRes = await DioClient.instance.get(ApiEndpoints.customers);
      if (custRes.data['success'] == true) {
        setState(() {
          _myCustomers     = List<Map<String, dynamic>>.from(custRes.data['data'] ?? []);
          _customersVisited = _myCustomers.length;
        });
      }

      // Load orders (backend already scopes this to the salesman's own
      // customers — salesman_id == self, see orders.service.js#getOrders).
      final ordersRes = await DioClient.instance.get(ApiEndpoints.orders);
      if (ordersRes.data['success'] == true) {
        final orders = List<Map<String, dynamic>>.from(ordersRes.data['data'] ?? []);
        final today  = DateTime.now();
        setState(() {
          _ordersToday = orders.where((o) {
            final created = DateTime.tryParse(o['created_at'] ?? '');
            return created != null &&
                created.day   == today.day &&
                created.month == today.month;
          }).length;
          _myOrders = orders.take(8).toList();
        });
      }
    } catch (e) {
      debugPrint('Dashboard error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      drawer: _buildDrawer(context),
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          child: _isLoading
              ? const Center(
                  key: ValueKey('loading'),
                  child: CircularProgressIndicator(color: AppColors.orange))
              : RefreshIndicator(
                key: const ValueKey('content'),
                color: AppColors.orange,
                onRefresh: _loadDashboard,
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
                          bottomLeft:  Radius.circular(28),
                          bottomRight: Radius.circular(28),
                        ),
                      ),
                      child: Column(
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
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
                              const SizedBox(width: 12),
                              Expanded(
                                child: GestureDetector(
                                  onTap: () => context.push('/salesman-profile'),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text('Good Morning,',
                                          style: TextStyle(color: Colors.white70, fontSize: 12)),
                                      Text(_salesmanName,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 18,
                                              fontWeight: FontWeight.bold)),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              GestureDetector(
                                onTap: () => context.push('/notifications'),
                                child: Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.1),
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.notifications_outlined, color: Colors.white, size: 20),
                                ),
                              ),
                              const SizedBox(width: 8),
                              GestureDetector(
                                onTap: _showProfilePopup,
                                child: CircleAvatar(
                                  radius: 18,
                                  backgroundColor: AppColors.orange,
                                  child: Text(
                                    _salesmanName.isNotEmpty ? _salesmanName[0].toUpperCase() : 'S',
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: AppColors.success.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: AppColors.success),
                              ),
                              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                                Icon(Icons.location_on, color: AppColors.success, size: 12),
                                SizedBox(width: 4),
                                Text('GPS Active',
                                    style: TextStyle(
                                        color: AppColors.success,
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold)),
                              ]),
                            ),
                          ),
                          const SizedBox(height: 20),
                          // Stats Row
                          Row(
                            children: [
                              Expanded(child: StaggeredFadeIn(index: 0, baseDelay: const Duration(milliseconds: 100), child: _statCard('Orders\nToday',       '$_ordersToday',        Icons.shopping_bag_outlined))),
                              const SizedBox(width: 12),
                              Expanded(child: StaggeredFadeIn(index: 1, baseDelay: const Duration(milliseconds: 100), child: _statCard('Payments\nCollected', _paymentsCollected,     Icons.payments_outlined))),
                              const SizedBox(width: 12),
                              Expanded(child: StaggeredFadeIn(index: 2, baseDelay: const Duration(milliseconds: 100), child: _statCard('Customers\nVisited',  '$_customersVisited',   Icons.people_outline))),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Quick Actions
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Row(
                        children: [
                          Expanded(
                            child: TapScale(
                              onTap: () => context.push('/create-order'),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 10),
                                decoration: BoxDecoration(
                                  color: AppColors.navy,
                                  borderRadius: BorderRadius.circular(16),
                                  boxShadow: [
                                    BoxShadow(
                                        color: AppColors.navy.withValues(alpha: 0.3),
                                        blurRadius: 12,
                                        offset: const Offset(0, 4))
                                  ],
                                ),
                                child: const Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.add_circle_outline, color: Colors.white),
                                    SizedBox(height: 6),
                                    Text('New Order',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                            color: Colors.white,
                                            fontSize: 12,
                                            fontWeight: FontWeight.bold)),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: TapScale(
                              onTap: () => context.push('/record-payment'),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 10),
                                decoration: BoxDecoration(
                                  color: AppColors.orange,
                                  borderRadius: BorderRadius.circular(16),
                                  boxShadow: [
                                    BoxShadow(
                                        color: AppColors.orange.withValues(alpha: 0.3),
                                        blurRadius: 12,
                                        offset: const Offset(0, 4))
                                  ],
                                ),
                                child: const Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.camera_alt_outlined, color: Colors.white),
                                    SizedBox(height: 6),
                                    Text('Record Payment',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                            color: Colors.white,
                                            fontSize: 12,
                                            fontWeight: FontWeight.bold)),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: TapScale(
                              onTap: () => context.push('/add-customer'),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 10),
                                decoration: BoxDecoration(
                                  color: AppColors.success,
                                  borderRadius: BorderRadius.circular(16),
                                  boxShadow: [
                                    BoxShadow(
                                        color: AppColors.success.withValues(alpha: 0.3),
                                        blurRadius: 12,
                                        offset: const Offset(0, 4))
                                  ],
                                ),
                                child: const Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.person_add_alt_outlined, color: Colors.white),
                                    SizedBox(height: 6),
                                    Text('Add Customer',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                            color: Colors.white,
                                            fontSize: 12,
                                            fontWeight: FontWeight.bold)),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // My Orders — every option that used to live here (Products,
                    // Record Visit, Cash Collection, GPS Tracking, etc.) moved
                    // into the drawer; this slot now shows what admin/customer
                    // actually want to glance at: the salesman's own customers'
                    // orders, tap-through to full detail.
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: const Text('My Orders',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.navy)),
                    ),
                    const SizedBox(height: 12),
                    if (_myOrders.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                        child: Text('No orders yet.', style: TextStyle(color: AppColors.steelBlue)),
                      )
                    else
                      ..._myOrders.asMap().entries.map((e) => _orderCard(context, e.value, e.key)),
                    const SizedBox(height: 24),

                    // My Customers
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('My Customers',
                              style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.navy)),
                          GestureDetector(
                            onTap: () => context.push('/my-customers'),
                            child: const Text('View All',
                                style: TextStyle(
                                    color: AppColors.orange,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (_myCustomers.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                        child: Text('No customers yet.',
                            style: TextStyle(color: AppColors.steelBlue)),
                      )
                    else
                      ..._myCustomers.take(3).toList().asMap().entries.map((entry) => _customerCard(
                            context,
                            entry.value['full_name'] ?? 'Customer',
                            entry.value['phone'] ?? '',
                            _asNum(entry.value['outstanding_balance']),
                            entry.key,
                          )),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
        ),
      ),
    );
  }

  Widget _statCard(String label, String value, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white24),
      ),
      child: Column(
        children: [
          Icon(icon, color: AppColors.orange, size: 22),
          const SizedBox(height: 6),
          Text(value,
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 15)),
          Text(label,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white60, fontSize: 10)),
        ],
      ),
    );
  }

  static const _statusColors = {
    'pending': AppColors.steelBlue,
    'confirmed': AppColors.navy,
    'preparing': AppColors.orange,
    'dispatched': AppColors.orange,
    'delivered': AppColors.success,
    'undelivered': AppColors.error,
    'cancelled': AppColors.error,
  };

  Widget _orderCard(BuildContext context, Map<String, dynamic> order, int index) {
    final status = (order['status'] ?? 'pending').toString();
    final color = _statusColors[status] ?? AppColors.steelBlue;
    final orderNumber = (order['order_number'] ?? order['id'] ?? '').toString();
    final customerName = order['users']?['full_name'] ?? 'Customer';
    final amount = _asNum(order['total_amount']);
    final date = (order['created_at'] ?? '').toString();
    final shortDate = date.length >= 10 ? date.substring(0, 10) : date;

    return StaggeredFadeIn(
      index: index,
      child: TapScale(
        onTap: () => context.push('/order-tracking', extra: order['id']?.toString())
            .then((_) => _loadDashboard()),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Row(children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
              child: Icon(Icons.receipt_long_outlined, color: color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(orderNumber, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 13)),
                const SizedBox(height: 2),
                Text('$customerName · $shortDate', style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('PKR ${amount.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 13)),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                child: Text(status.toUpperCase(), style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.bold)),
              ),
            ]),
          ]),
        ),
      ),
    );
  }

  num _asNum(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '0') ?? 0;

  Widget _customerCard(BuildContext context, String name, String phone, num outstanding, int index) {
    return StaggeredFadeIn(
      index: index,
      child: TapScale(
      onTap: () => context.push('/my-customers'),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 8,
                offset: const Offset(0, 2))
          ],
        ),
        child: Row(
          children: [
            const CircleAvatar(
              backgroundColor: AppColors.navy,
              child: Icon(Icons.business, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: AppColors.navy,
                          fontSize: 14)),
                  Text(phone,
                      style: const TextStyle(
                          color: AppColors.steelBlue, fontSize: 12)),
                ],
              ),
            ),
            if (outstanding > 0)
              Text('PKR ${outstanding.toStringAsFixed(0)}',
                  style: const TextStyle(color: AppColors.error, fontWeight: FontWeight.bold, fontSize: 12))
            else
              const Icon(Icons.arrow_forward_ios,
                  color: AppColors.steelBlue, size: 14),
          ],
        ),
      ),
      ),
    );
  }

  Drawer _buildDrawer(BuildContext context) {
    return Drawer(
      backgroundColor: AppColors.white,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
              decoration: const BoxDecoration(
                color: AppColors.navy,
                borderRadius: BorderRadius.only(bottomRight: Radius.circular(28)),
              ),
              child: Row(children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: AppColors.orange,
                  child: Text(
                    _salesmanName.isNotEmpty ? _salesmanName[0].toUpperCase() : 'S',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_salesmanName,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 16)),
                    const SizedBox(height: 2),
                    const Text('Salesman', style: TextStyle(color: Colors.white60, fontSize: 12)),
                  ]),
                ),
              ]),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: [
                  _drawerItem(context, Icons.person_outline, 'My Profile', '/salesman-profile'),
                  _drawerItem(context, Icons.storefront_outlined, 'Products', '/salesman-products'),
                  _drawerItem(context, Icons.add_circle_outline, 'New Order', '/create-order'),
                  _drawerItem(context, Icons.person_add_alt_outlined, 'Add Customer', '/add-customer'),
                  _drawerItem(context, Icons.people_outline, 'My Customers', '/my-customers'),
                  _drawerItem(context, Icons.camera_alt_outlined, 'Record Payment', '/record-payment'),
                  _drawerItem(context, Icons.event_note_outlined, 'Record Visit', '/record-visit'),
                  _drawerItem(context, Icons.account_balance_wallet_outlined, 'Cash Collection', '/cash-collection'),
                  _drawerItem(context, Icons.location_on_outlined, 'GPS Tracking', '/gps-tracking'),
                  _drawerItem(context, Icons.bar_chart_outlined, 'My Performance', '/performance'),
                  _drawerItem(context, Icons.event_available_outlined, 'Attendance', '/attendance'),
                  _drawerItem(context, Icons.request_page_outlined, 'My Payslip', '/payslip'),
                  _drawerItem(context, Icons.notifications_outlined, 'Notifications', '/notifications'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _drawerItem(BuildContext context, IconData icon, String label, String route) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      leading: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(color: AppColors.orange.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, color: AppColors.orange, size: 19),
      ),
      title: Text(label, style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w600, fontSize: 14)),
      onTap: () {
        Navigator.of(context).pop();
        context.push(route);
      },
    );
  }
}
