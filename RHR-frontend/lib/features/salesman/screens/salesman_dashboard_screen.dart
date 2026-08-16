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
                  context.go('/salesman-profile');
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

      // Load today's orders
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
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          child: _isLoading
              ? const Center(
                  key: ValueKey('loading'),
                  child: CircularProgressIndicator(color: AppColors.orange))
              : SingleChildScrollView(
                key: const ValueKey('content'),
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
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: GestureDetector(
                                  onTap: () => context.go('/salesman-profile'),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text('Good Morning,',
                                          style: TextStyle(color: Colors.white70, fontSize: 13)),
                                      Text(_salesmanName,
                                          style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 20,
                                              fontWeight: FontWeight.bold)),
                                    ],
                                  ),
                                ),
                              ),
                              Row(
                                children: [
                                  GestureDetector(
                                    onTap: () => context.go('/notifications'),
                                    child: Container(
                                      padding: const EdgeInsets.all(8),
                                      decoration: BoxDecoration(
                                        color: Colors.white.withValues(alpha: 0.1),
                                        shape: BoxShape.circle,
                                      ),
                                      child: const Icon(Icons.notifications_outlined, color: Colors.white),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  GestureDetector(
                                    onTap: _showProfilePopup,
                                    child: CircleAvatar(
                                      backgroundColor: AppColors.orange,
                                      child: Text(
                                        _salesmanName.isNotEmpty ? _salesmanName[0].toUpperCase() : 'S',
                                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 10, vertical: 5),
                                    decoration: BoxDecoration(
                                      color: AppColors.success.withValues(alpha: 0.2),
                                      borderRadius: BorderRadius.circular(20),
                                      border: Border.all(color: AppColors.success),
                                    ),
                                    child: const Row(children: [
                                      Icon(Icons.location_on,
                                          color: AppColors.success, size: 12),
                                      SizedBox(width: 4),
                                      Text('GPS Active',
                                          style: TextStyle(
                                              color: AppColors.success,
                                              fontSize: 11,
                                              fontWeight: FontWeight.bold)),
                                    ]),
                                  ),
                                ],
                              ),
                            ],
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
                              onTap: () => context.go('/create-order'),
                              child: Container(
                                padding: const EdgeInsets.all(18),
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
                                child: const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.add_circle_outline, color: Colors.white),
                                    SizedBox(width: 8),
                                    Text('New Order',
                                        style: TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.bold)),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TapScale(
                              onTap: () => context.go('/record-payment'),
                              child: Container(
                                padding: const EdgeInsets.all(18),
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
                                child: const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.camera_alt_outlined, color: Colors.white),
                                    SizedBox(width: 8),
                                    Text('Record Payment',
                                        style: TextStyle(
                                            color: Colors.white,
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

                    // My Tools
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 20),
                      child: Text('My Tools',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: AppColors.navy)),
                    ),
                    const SizedBox(height: 12),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: GridView.count(
                        crossAxisCount: 3,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 12,
                        crossAxisSpacing: 12,
                        childAspectRatio: 0.95,
                        children: [
                          _toolItem(context, Icons.location_on_outlined, 'GPS Tracking', '/gps-tracking', 0),
                          _toolItem(context, Icons.map_outlined, 'Customer Map', '/customer-map', 1),
                          _toolItem(context, Icons.bar_chart_outlined, 'My Performance', '/performance', 2),
                          _toolItem(context, Icons.event_available_outlined, 'Attendance', '/attendance', 3),
                          _toolItem(context, Icons.event_busy_outlined, 'Apply Leave', '/leave', 4),
                          _toolItem(context, Icons.request_page_outlined, 'My Payslip', '/payslip', 5),
                          _toolItem(context, Icons.notifications_outlined, 'Notifications', '/notifications', 6),
                        ],
                      ),
                    ),
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
                            onTap: () => context.go('/my-customers'),
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
                            entry.key,
                          )),
                    const SizedBox(height: 24),
                  ],
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

  Widget _toolItem(BuildContext context, IconData icon, String label, String route, int index) {
    return StaggeredFadeIn(
      index: index,
      child: TapScale(
        onTap: () => context.go(route),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
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
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: AppColors.orange, size: 24),
              const SizedBox(height: 8),
              Text(label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.navy,
                      fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _customerCard(BuildContext context, String name, String phone, int index) {
    return StaggeredFadeIn(
      index: index,
      child: TapScale(
      onTap: () => context.go('/my-customers'),
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
            const Icon(Icons.arrow_forward_ios,
                color: AppColors.steelBlue, size: 14),
          ],
        ),
      ),
      ),
    );
  }
}
