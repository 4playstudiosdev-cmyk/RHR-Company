import 'package:flutter/material.dart';
import '../../../core/features/app_features.dart';
import '../../../core/location/background_tracking_helper.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';
import '../../../shared/customer_display.dart';

// Design tokens matching the RHR Connect enterprise mockups
const _kNavy      = Color(0xFF00185D);
const _kNavyLight = Color(0xFF0A2472);
const _kNavyDark  = Color(0xFF000D3A);
const _kGreen     = Color(0xFF00C853);
const _kRed       = Color(0xFFFF3B30);
const _kAmber     = Color(0xFFFFA726);
const _kCardBg    = Color(0xFFF5F7FA);

class SalesmanDashboardScreen extends StatefulWidget {
  const SalesmanDashboardScreen({super.key});

  @override
  State<SalesmanDashboardScreen> createState() => _SalesmanDashboardScreenState();
}

class _SalesmanDashboardScreenState extends State<SalesmanDashboardScreen> {
  int _ordersToday        = 0;
  num _paymentsCollected  = 0;
  int _customersVisited   = 0;
  List<Map<String, dynamic>> _myCustomers = [];
  List<Map<String, dynamic>> _myOrders = [];
  bool _isLoading = true;
  String _salesmanName = 'Salesman';
  String _salesmanPhone = '';
  String _salesmanPosition = '';
  String _salesmanPhotoUrl = '';

  @override
  void initState() {
    super.initState();
    _loadDashboard();
    _loadName();
    AppFeatures.notifier.addListener(_onFeatures);
    AppFeatures.load();
    WidgetsBinding.instance.addPostFrameCallback((_) => BackgroundTrackingHelper.promptIfNeeded(context));
  }

  void _onFeatures() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    AppFeatures.notifier.removeListener(_onFeatures);
    super.dispose();
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
    try {
      final res = await DioClient.instance.get(ApiEndpoints.salesmanMyProfile);
      if (res.data['success'] == true && mounted) {
        final url = (res.data['data']?['profile_photo_url'] ?? '').toString();
        if (url.isNotEmpty) setState(() => _salesmanPhotoUrl = url);
      }
    } catch (e) {
      debugPrint('Profile photo load error: $e');
    }
  }

  Future<void> _loadDashboard() async {
    try {
      final custRes = await DioClient.instance.get(ApiEndpoints.customers);
      if (custRes.data['success'] == true) {
        setState(() {
          _myCustomers = List<Map<String, dynamic>>.from(custRes.data['data'] ?? []);
        });
      }

      try {
        final now = DateTime.now();
        final today = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
        final visitsRes = await DioClient.instance.get(ApiEndpoints.visits, queryParameters: {'from': today, 'to': today});
        if (visitsRes.data['success'] == true) {
          final visits = List<Map<String, dynamic>>.from(visitsRes.data['data'] ?? []);
          setState(() => _customersVisited = visits.map((v) => v['customer_id']).toSet().length);
        }
      } catch (e) {
        debugPrint('Visits load error: $e');
      }

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
          _myOrders = orders
              .where((o) => !{'delivered', 'cancelled', 'undelivered'}.contains((o['status'] ?? '').toString()))
              .take(8)
              .toList();
        });
      }

      final res = await DioClient.instance.get(ApiEndpoints.recoveryTransactionsMe);
      final today = DateTime.now().toUtc().add(const Duration(hours: 5)).toIso8601String().substring(0, 10);
      num collected = 0;
      if (res.data['success'] == true) {
        final rows = List<Map<String, dynamic>>.from(res.data['data'] ?? []);
        for (final r in rows) {
          if ((r['status'] ?? '') == 'approved' && (r['recovery_date'] ?? '').toString() == today) {
            final amt = r['amount'];
            collected += amt is num ? amt : num.tryParse(amt?.toString() ?? '0') ?? 0;
          }
        }
      }
      if (mounted) setState(() => _paymentsCollected = collected);
    } catch (e) {
      debugPrint('Dashboard error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  num _asNum(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '0') ?? 0;

  String _formatAmount(num v) {
    if (v >= 1000000) return 'PKR ${(v / 1000000).toStringAsFixed(1)}M';
    if (v >= 1000)    return 'PKR ${(v / 1000).toStringAsFixed(1)}k';
    return 'PKR ${v.toStringAsFixed(0)}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _kCardBg,
      drawer: _buildDrawer(context),
      bottomNavigationBar: _buildBottomNav(context),
      body: SafeArea(
        bottom: false,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          child: _isLoading
              ? const Center(
                  key: ValueKey('loading'),
                  child: CircularProgressIndicator(color: _kNavy))
              : RefreshIndicator(
                  key: const ValueKey('content'),
                  color: _kGreen,
                  onRefresh: _loadDashboard,
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    child: Column(
                      children: [
                        _buildHeader(context),
                        const SizedBox(height: 20),
                        _buildBookingsCard(),
                        const SizedBox(height: 20),
                        _buildQuickActions(context),
                        const SizedBox(height: 24),
                        _buildSectionHeader('My Orders', 'Delivered Orders', () => context.push('/salesman-delivered-orders')),
                        const SizedBox(height: 10),
                        if (_myOrders.isEmpty)
                          _buildEmptyState('No active orders')
                        else
                          ..._myOrders.asMap().entries.map((e) => _orderCard(context, e.value, e.key)),
                        const SizedBox(height: 24),
                        _buildSectionHeader('My Customers', 'View All', () => context.push('/my-customers'),
                            trailing2: 'Outstanding', onTrailing2: () => context.push('/salesman-outstanding')),
                        const SizedBox(height: 10),
                        if (_myCustomers.isEmpty)
                          _buildEmptyState('No customers yet')
                        else
                          ..._myCustomers.take(3).toList().asMap().entries.map((entry) => _customerCard(
                                context, entry.value, entry.key)),
                        const SizedBox(height: 100),
                      ],
                    ),
                  ),
                ),
        ),
      ),
    );
  }

  // ── Header ────────────────────────────────────────────────────────────────

  Widget _buildHeader(BuildContext context) {
    final initials = _salesmanName.isNotEmpty ? _salesmanName[0].toUpperCase() : 'S';
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [_kNavyDark, _kNavyLight],
        ),
        borderRadius: BorderRadius.only(
          bottomLeft:  Radius.circular(28),
          bottomRight: Radius.circular(28),
        ),
      ),
      child: Column(
        children: [
          // Top bar: logo + brand + GPS + bell
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
            child: Row(
              children: [
                // Menu button
                Builder(builder: (ctx) => GestureDetector(
                  onTap: () => Scaffold.of(ctx).openDrawer(),
                  child: Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.menu_rounded, color: Colors.white, size: 20),
                  ),
                )),
                const SizedBox(width: 10),
                // Logo + name
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.asset('assets/images/rhr-logo.jpeg',
                      width: 34, height: 34, fit: BoxFit.cover),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('RHR Connect',
                          style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700, letterSpacing: 0.2)),
                      const Text('SALES PORTAL',
                          style: TextStyle(color: Colors.white54, fontSize: 9, letterSpacing: 1.2, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                // Notification bell
                GestureDetector(
                  onTap: () => context.push('/notifications'),
                  child: Stack(children: [
                    Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.notifications_outlined, color: Colors.white, size: 20),
                    ),
                  ]),
                ),
              ],
            ),
          ),

          // Salesman name section
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
            child: Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () => context.push('/salesman-profile'),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            _salesmanPosition.isNotEmpty ? _salesmanPosition.toUpperCase() : 'FIELD SALES OFFICER',
                            style: const TextStyle(color: Colors.white70, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 1.0),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(_salesmanName,
                            style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                      ],
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: () => context.push('/salesman-profile'),
                  child: CircleAvatar(
                    radius: 22,
                    backgroundColor: Colors.white.withValues(alpha: 0.18),
                    backgroundImage: _salesmanPhotoUrl.isNotEmpty ? NetworkImage(_salesmanPhotoUrl) : null,
                    child: _salesmanPhotoUrl.isEmpty
                        ? Text(initials, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 17))
                        : null,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  // ── TODAY'S BOOKINGS card ─────────────────────────────────────────────────

  Widget _buildBookingsCard() {
    final pct = _paymentsCollected > 0 ? (_paymentsCollected / (_paymentsCollected + 10000)).clamp(0.0, 1.0).toDouble() : 0.0;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [_kNavy, Color(0xFF1A3A8F)],
          ),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(color: _kNavy.withValues(alpha: 0.4), blurRadius: 18, offset: const Offset(0, 6)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Colors.white24),
                ),
                child: Row(children: [
                  const Icon(Icons.trending_up_rounded, color: Colors.white70, size: 12),
                  const SizedBox(width: 4),
                  const Text("TODAY'S BOOKINGS",
                      style: TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.6)),
                ]),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: _kGreen.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(20)),
                child: Text(
                  _ordersToday > 0 ? '+$_ordersToday orders' : 'No orders yet',
                  style: const TextStyle(color: _kGreen, fontSize: 10, fontWeight: FontWeight.w700),
                ),
              ),
            ]),
            const SizedBox(height: 14),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                _paymentsCollected > 0
                    ? 'PKR ${_paymentsCollected.toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')}'
                    : 'PKR 0',
                style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w800, letterSpacing: -0.5),
              ),
            ),
            const SizedBox(height: 4),
            Row(children: [
              const Expanded(
                child: Text('Collected today', style: TextStyle(color: Colors.white54, fontSize: 11)),
              ),
              Text('${(pct * 100).toStringAsFixed(0)}% Achieved',
                  style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600)),
            ]),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: pct,
                backgroundColor: Colors.white.withValues(alpha: 0.15),
                valueColor: const AlwaysStoppedAnimation<Color>(_kGreen),
                minHeight: 5,
              ),
            ),
            const SizedBox(height: 18),
            // 3 stats
            Row(children: [
              _statTile('VISITS', _customersVisited.toString(), Icons.location_on_outlined),
              _vertDivider(),
              _statTile('ORDERS', _ordersToday.toString(), Icons.shopping_bag_outlined,
                  onTap: () => context.push('/salesman-all-orders')),
              _vertDivider(),
              _statTile('COLLECTED', _formatAmount(_paymentsCollected), Icons.payments_outlined,
                  onTap: () => context.push('/salesman-payments-collected')),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _vertDivider() => Container(width: 1, height: 40, color: Colors.white.withValues(alpha: 0.15));

  Widget _statTile(String label, String value, IconData icon, {VoidCallback? onTap}) {
    final w = Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Column(children: [
          Icon(icon, color: Colors.white54, size: 16),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(value,
                style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(height: 2),
          Text(label,
              style: const TextStyle(color: Colors.white38, fontSize: 9, fontWeight: FontWeight.w600, letterSpacing: 0.5)),
        ]),
      ),
    );
    return w;
  }

  // ── Quick Actions ─────────────────────────────────────────────────────────

  Widget _buildQuickActions(BuildContext context) {
    final actions = <Map<String, dynamic>>[
      if (AppFeatures.has('new_order'))
        {'icon': Icons.add_shopping_cart_rounded, 'label': 'Take Order', 'route': '/create-order', 'color': _kNavy},
      if (AppFeatures.has('record_payment'))
        {'icon': Icons.photo_camera_outlined, 'label': 'Log Payment', 'route': '/record-payment', 'color': const Color(0xFF1565C0)},
      if (AppFeatures.has('add_customer'))
        {'icon': Icons.person_add_alt_1_outlined, 'label': 'Add Customer', 'route': '/add-customer', 'color': const Color(0xFF00695C)},
      if (AppFeatures.has('my_customers'))
        {'icon': Icons.storefront_outlined, 'label': 'My Customers', 'route': '/my-customers', 'color': const Color(0xFF37474F)},
    ];

    if (actions.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: actions.asMap().entries.map((e) {
          final a = e.value;
          return Expanded(
            child: Padding(
              padding: EdgeInsets.only(left: e.key == 0 ? 0 : 8),
              child: TapScale(
                onTap: () => context.push(a['route'] as String),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
                  ),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                      width: 44, height: 44,
                      decoration: BoxDecoration(
                        color: (a['color'] as Color).withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(a['icon'] as IconData, color: a['color'] as Color, size: 22),
                    ),
                    const SizedBox(height: 8),
                    Text(a['label'] as String,
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        style: const TextStyle(color: _kNavy, fontSize: 10, fontWeight: FontWeight.w700, height: 1.2)),
                  ]),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  // ── Section header ────────────────────────────────────────────────────────

  Widget _buildSectionHeader(String title, String action, VoidCallback onAction,
      {String? trailing2, VoidCallback? onTrailing2}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(children: [
        Text(title,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: _kNavy, letterSpacing: -0.2)),
        const Spacer(),
        if (trailing2 != null && onTrailing2 != null) ...[
          GestureDetector(
            onTap: onTrailing2,
            child: Text(trailing2, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _kRed)),
          ),
          const SizedBox(width: 12),
        ],
        GestureDetector(
          onTap: onAction,
          child: Row(children: [
            Text(action, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _kNavy)),
            const SizedBox(width: 2),
            const Icon(Icons.chevron_right_rounded, size: 16, color: _kNavy),
          ]),
        ),
      ]),
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  Widget _buildEmptyState(String msg) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
        child: Text(msg, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black38, fontSize: 13)),
      ),
    );
  }

  // ── Order card ────────────────────────────────────────────────────────────

  static const _statusColors = {
    'pending':     Color(0xFF1565C0),
    'confirmed':   _kNavy,
    'preparing':   _kAmber,
    'dispatched':  _kAmber,
    'delivered':   _kGreen,
    'undelivered': _kRed,
    'cancelled':   _kRed,
  };

  Widget _orderCard(BuildContext context, Map<String, dynamic> order, int index) {
    final status       = (order['status'] ?? 'pending').toString();
    final color        = _statusColors[status] ?? _kNavy;
    final orderNumber  = (order['order_number'] ?? order['id'] ?? '').toString();
    final customerName = customerTitle(order['users'] as Map?);
    final amount       = _asNum(order['total_amount']);
    final date         = (order['created_at'] ?? '').toString();
    final shortDate    = date.length >= 10 ? date.substring(0, 10) : date;

    return StaggeredFadeIn(
      index: index,
      child: TapScale(
        onTap: () => context.push('/order-tracking', extra: order['id']?.toString()).then((_) => _loadDashboard()),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Row(children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(color: color.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
              child: Icon(Icons.receipt_long_outlined, color: color, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(orderNumber,
                  style: const TextStyle(fontWeight: FontWeight.w700, color: _kNavy, fontSize: 13)),
              const SizedBox(height: 2),
              Text('$customerName · $shortDate',
                  style: const TextStyle(color: Colors.black45, fontSize: 11)),
            ])),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('PKR ${amount.toStringAsFixed(0)}',
                  style: const TextStyle(fontWeight: FontWeight.w700, color: _kNavy, fontSize: 13)),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(20)),
                child: Text(status.toUpperCase(),
                    style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.4)),
              ),
            ]),
          ]),
        ),
      ),
    );
  }

  // ── Customer card ─────────────────────────────────────────────────────────

  Widget _customerCard(BuildContext context, Map<String, dynamic> c, int index) {
    final name        = customerTitle(c);
    final phone       = c['phone'] ?? '';
    final outstanding = _asNum(c['outstanding_balance']);
    final initials    = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return StaggeredFadeIn(
      index: index,
      child: TapScale(
        onTap: () => context.push('/my-customers'),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Row(children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: _kNavy.withValues(alpha: 0.08),
              child: Text(initials, style: const TextStyle(color: _kNavy, fontWeight: FontWeight.w700, fontSize: 15)),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name,
                  style: const TextStyle(fontWeight: FontWeight.w700, color: _kNavy, fontSize: 13)),
              if (phone.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(phone, style: const TextStyle(color: Colors.black38, fontSize: 11)),
              ],
            ])),
            if (outstanding > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: _kRed.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(8)),
                child: Text('PKR ${outstanding.toStringAsFixed(0)}',
                    style: const TextStyle(color: _kRed, fontWeight: FontWeight.w700, fontSize: 12)),
              )
            else
              const Icon(Icons.chevron_right_rounded, color: Colors.black26, size: 20),
          ]),
        ),
      ),
    );
  }

  // ── Bottom navigation ─────────────────────────────────────────────────────

  Widget _buildBottomNav(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 16, offset: const Offset(0, -4))],
      ),
      child: SafeArea(
        child: SizedBox(
          height: 62,
          child: Row(children: [
            _navItem(context, Icons.grid_view_rounded, 'Dashboard', () {}, isActive: true),
            _navItem(context, Icons.people_outline_rounded, 'Customers', () => context.push('/my-customers')),
            // Centre record payment button
            Expanded(
              child: Center(
                child: GestureDetector(
                  onTap: AppFeatures.has('record_payment') ? () => context.push('/record-payment') : null,
                  child: Container(
                    width: 52, height: 52,
                    decoration: BoxDecoration(
                      color: _kNavy,
                      shape: BoxShape.circle,
                      boxShadow: [BoxShadow(color: _kNavy.withValues(alpha: 0.4), blurRadius: 12, offset: const Offset(0, 4))],
                    ),
                    child: const Icon(Icons.photo_camera_outlined, color: Colors.white, size: 24),
                  ),
                ),
              ),
            ),
            _navItem(context, Icons.receipt_long_outlined, 'Orders', () => context.push('/salesman-all-orders')),
            _navItem(context, Icons.person_outline_rounded, 'Profile', () => context.push('/salesman-profile')),
          ]),
        ),
      ),
    );
  }

  Widget _navItem(BuildContext context, IconData icon, String label, VoidCallback onTap,
      {bool isActive = false}) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon, color: isActive ? _kNavy : Colors.black38, size: 22),
          const SizedBox(height: 3),
          Text(label,
              style: TextStyle(
                  color: isActive ? _kNavy : Colors.black38,
                  fontSize: 9,
                  fontWeight: isActive ? FontWeight.w700 : FontWeight.w500)),
        ]),
      ),
    );
  }

  // ── Drawer ────────────────────────────────────────────────────────────────

  Drawer _buildDrawer(BuildContext context) {
    final initials = _salesmanName.isNotEmpty ? _salesmanName[0].toUpperCase() : 'S';
    return Drawer(
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.only(topRight: Radius.circular(24), bottomRight: Radius.circular(24)),
      ),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [_kNavyDark, _kNavyLight],
                ),
                borderRadius: BorderRadius.only(bottomRight: Radius.circular(24)),
              ),
              child: Row(children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: Colors.white.withValues(alpha: 0.15),
                  backgroundImage: _salesmanPhotoUrl.isNotEmpty ? NetworkImage(_salesmanPhotoUrl) : null,
                  child: _salesmanPhotoUrl.isEmpty
                      ? Text(initials, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 22))
                      : null,
                ),
                const SizedBox(width: 14),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_salesmanName,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 16)),
                  const SizedBox(height: 2),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text('SALESMAN', style: TextStyle(color: Colors.white70, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.8)),
                  ),
                ])),
              ]),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: [
                  _drawerItem(context, Icons.person_outline, 'My Profile', '/salesman-profile'),
                  if (AppFeatures.has('products'))   _drawerItem(context, Icons.storefront_outlined, 'Products', '/salesman-products'),
                  if (AppFeatures.has('new_order'))  _drawerItem(context, Icons.add_circle_outline, 'New Order', '/create-order'),
                  if (AppFeatures.has('add_customer')) _drawerItem(context, Icons.person_add_alt_outlined, 'Add Customer', '/add-customer'),
                  if (AppFeatures.has('my_customers')) _drawerItem(context, Icons.people_outline, 'My Customers', '/my-customers'),
                  if (AppFeatures.has('orders_history')) _drawerItem(context, Icons.local_shipping_outlined, 'Delivered Orders', '/salesman-delivered-orders'),
                  if (AppFeatures.has('orders_history')) _drawerItem(context, Icons.cancel_outlined, 'Cancelled Orders', '/salesman-cancelled-orders'),
                  if (AppFeatures.has('outstanding')) _drawerItem(context, Icons.account_balance_wallet_outlined, 'Outstanding Balances', '/salesman-outstanding'),
                  if (AppFeatures.has('record_payment')) _drawerItem(context, Icons.camera_alt_outlined, 'Record Payment', '/record-payment'),
                  if (AppFeatures.has('visits')) _drawerItem(context, Icons.history, 'Customer Visit History', '/visit-history'),
                  if (AppFeatures.has('visits')) _drawerItem(context, Icons.event_note_outlined, 'Record Visit', '/record-visit'),
                  if (AppFeatures.has('cash_collection')) _drawerItem(context, Icons.account_balance_wallet_outlined, 'Cash Collection', '/cash-collection'),
                  if (AppFeatures.has('performance')) _drawerItem(context, Icons.bar_chart_outlined, 'My Performance', '/performance'),
                  if (AppFeatures.has('attendance')) _drawerItem(context, Icons.event_available_outlined, 'Attendance', '/attendance'),
                  if (AppFeatures.has('payslip')) _drawerItem(context, Icons.request_page_outlined, 'My Payslip', '/payslip'),
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
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 1),
      leading: Container(
        width: 38, height: 38,
        decoration: BoxDecoration(
          color: _kNavy.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: _kNavy, size: 19),
      ),
      title: Text(label, style: const TextStyle(color: _kNavy, fontWeight: FontWeight.w600, fontSize: 13)),
      onTap: () {
        Navigator.of(context).pop();
        context.push(route);
      },
    );
  }
}
