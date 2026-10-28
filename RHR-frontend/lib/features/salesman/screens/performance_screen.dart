import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../../shared/router/app_transitions.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/premium_ui.dart';

class PerformanceScreen extends StatefulWidget {
  const PerformanceScreen({super.key});

  @override
  State<PerformanceScreen> createState() => _PerformanceScreenState();
}

class _PerformanceScreenState extends State<PerformanceScreen> with SingleTickerProviderStateMixin {
  bool _isLoading = true;
  bool _hasError  = false;
  Map<String, dynamic>? _data;
  String _rangeLabel = 'Today';

  late final AnimationController _animCtrl;
  late final Animation<double>   _chartAnim;

  @override
  void initState() {
    super.initState();
    _animCtrl  = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    _chartAnim = CurvedAnimation(parent: _animCtrl, curve: Curves.easeOutCubic);
    _load();
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    super.dispose();
  }

  String _fmt(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _selectRange(String label) async {
    setState(() => _rangeLabel = label);
    final now = DateTime.now();
    DateTime from;
    DateTime to = now;
    switch (label) {
      case 'Today':
        from = DateTime(now.year, now.month, now.day);
        break;
      case 'Last 7 Days':
        from = now.subtract(const Duration(days: 6));
        break;
      case 'This Month':
        from = DateTime(now.year, now.month, 1);
        break;
      case 'Custom':
        final picked = await showDateRangePicker(
          context: context,
          firstDate: DateTime(now.year - 1),
          lastDate: now,
          initialDateRange: DateTimeRange(
              start: now.subtract(const Duration(days: 6)), end: now),
          builder: (ctx, child) => Theme(
            data: Theme.of(ctx).copyWith(
              colorScheme: const ColorScheme.light(primary: kNavy, onPrimary: Colors.white),
            ),
            child: child!,
          ),
        );
        if (picked == null) { setState(() => _rangeLabel = 'Today'); return; }
        from = picked.start;
        to   = picked.end;
        break;
      default:
        from = DateTime(now.year, now.month, now.day);
    }
    _load(from: from, to: to);
  }

  Future<void> _load({DateTime? from, DateTime? to}) async {
    setState(() { _isLoading = true; _hasError = false; });
    try {
      final userId = await SecureStorage.getUserId();
      if (userId == null || userId.isEmpty) {
        if (mounted) setState(() { _hasError = true; _isLoading = false; });
        return;
      }
      final effectiveFrom = from ?? DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
      final effectiveTo   = to   ?? DateTime.now();
      final response = await DioClient.instance.get(
        '/api/v1/analytics/salesman/$userId',
        queryParameters: {'from': _fmt(effectiveFrom), 'to': _fmt(effectiveTo)},
      );
      if (response.data['success'] == true && mounted) {
        setState(() => _data = response.data['data'] as Map<String, dynamic>);
        _animCtrl.forward(from: 0);
      } else {
        if (mounted) setState(() => _hasError = true);
      }
    } catch (e) {
      debugPrint('Performance error: $e');
      if (mounted) setState(() => _hasError = true);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  num _n(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '0') ?? 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCardBg,
      appBar: premiumAppBar(
        'My Performance',
        subtitle: _rangeLabel,
        onBack: () => goBack(context, '/salesman-dashboard'),
      ),
      body: Column(children: [
        // ── Range chips ────────────────────────────────────────────────────
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: SizedBox(
            height: 36,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: ['Today', 'Last 7 Days', 'This Month', 'Custom'].map((label) {
                final sel = _rangeLabel == label;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () => _selectRange(label),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: sel ? kNavy : Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: sel ? kNavy : const Color(0xFFE0E5EF)),
                        boxShadow: sel
                            ? [BoxShadow(color: kNavy.withValues(alpha: 0.25), blurRadius: 6, offset: const Offset(0, 2))]
                            : [],
                      ),
                      child: Text(label,
                          style: TextStyle(
                              color: sel ? Colors.white : kNavy,
                              fontWeight: FontWeight.w700, fontSize: 12)),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ),

        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator(color: kNavy))
              : _hasError || _data == null
                  ? _buildError()
                  : _buildContent(),
        ),
      ]),
    );
  }

  Widget _buildError() {
    return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 64, height: 64,
        decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.07), shape: BoxShape.circle),
        child: const Icon(Icons.bar_chart_outlined, size: 30, color: kNavy),
      ),
      const SizedBox(height: 14),
      const Text('Could not load performance data',
          style: TextStyle(color: kNavy, fontWeight: FontWeight.w600, fontSize: 15)),
      const SizedBox(height: 6),
      const Text('Check your connection and try again',
          style: TextStyle(color: kTextMuted, fontSize: 13)),
      const SizedBox(height: 20),
      GestureDetector(
        onTap: () => _selectRange(_rangeLabel),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          decoration: BoxDecoration(color: kNavy, borderRadius: BorderRadius.circular(12)),
          child: const Text('Retry', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        ),
      ),
    ]));
  }

  Widget _buildContent() {
    final d = _data!;
    final totalSales      = _n(d['totalSales']);
    final totalCollected  = _n(d['totalCollected']);
    final collectedCash   = _n(d['collectedCash']);
    final collectedBank   = _n(d['collectedBank']);
    final pendingCollected= _n(d['pendingCollected']);
    final pendingCount    = _n(d['pendingCount']);
    final cashInHand      = _n(d['cashInHand']);
    final totalDeposited  = _n(d['totalDeposited']);
    final pendingDeposit  = _n(d['pendingDeposit']);
    final totalOrders     = _n(d['totalOrders']);
    final deliveredOrders = _n(d['deliveredOrders']);
    final cancelledOrders = _n(d['cancelledOrders']);
    final totalVisits     = _n(d['totalVisits']);
    final totalCustomers  = _n(d['totalCustomers']);
    final customerBreakdown = List<Map<String, dynamic>>.from(d['customerBreakdown'] ?? []);
    final orders          = List<Map<String, dynamic>>.from(d['orders'] ?? []);

    // Chart: order statuses
    final statusCounts = <String, int>{};
    for (final o in orders) {
      final s = (o['status'] ?? 'pending') as String;
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }
    final statusEntries = statusCounts.entries.toList();
    final maxCount = statusEntries.isEmpty
        ? 1.0
        : statusEntries.map((e) => e.value).reduce((a, b) => a > b ? a : b).toDouble();

    return RefreshIndicator(
      color: kNavy,
      onRefresh: () => _selectRange(_rangeLabel),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Big Sales Card ────────────────────────────────────────────
          StaggeredFadeIn(index: 0, child: Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                  begin: Alignment.topLeft, end: Alignment.bottomRight,
                  colors: [kNavyDark, kNavyLight]),
              borderRadius: BorderRadius.circular(18),
              boxShadow: [BoxShadow(color: kNavy.withValues(alpha: 0.35), blurRadius: 14, offset: const Offset(0, 5))],
            ),
            child: Column(children: [
              Text('Total Sales — ${d['period'] ?? ''}',
                  style: const TextStyle(color: Colors.white54, fontSize: 13)),
              const SizedBox(height: 8),
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: totalSales.toDouble()),
                duration: const Duration(milliseconds: 800),
                curve: Curves.easeOutCubic,
                builder: (_, v, __) => Text('PKR ${v.toStringAsFixed(0)}',
                    style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(child: _miniStat('Collected', 'PKR ${totalCollected.toStringAsFixed(0)}', kGreen)),
                _vDivider(),
                Expanded(child: _miniStat('Pending', 'PKR ${pendingCollected.toStringAsFixed(0)}', kAmber)),
                _vDivider(),
                Expanded(child: _miniStat('Cash in Hand', 'PKR ${cashInHand.toStringAsFixed(0)}', Colors.white)),
              ]),
            ]),
          )),
          const SizedBox(height: 14),

          // ── Orders row ───────────────────────────────────────────────
          StaggeredFadeIn(index: 1, child: Row(children: [
            _sbox('Orders', '$totalOrders',     Icons.shopping_bag_outlined, kNavy),
            const SizedBox(width: 8),
            _sbox('Delivered', '$deliveredOrders', Icons.check_circle_outline_rounded, kGreen),
            const SizedBox(width: 8),
            _sbox('Cancelled', '$cancelledOrders', Icons.cancel_outlined, kRed),
          ])),
          const SizedBox(height: 8),

          // ── Collection row ───────────────────────────────────────────
          StaggeredFadeIn(index: 2, child: Row(children: [
            _sbox('Cash', 'PKR ${collectedCash.toStringAsFixed(0)}', Icons.payments_outlined, kGreen),
            const SizedBox(width: 8),
            _sbox('Bank', 'PKR ${collectedBank.toStringAsFixed(0)}', Icons.account_balance_outlined, const Color(0xFF1565C0)),
            const SizedBox(width: 8),
            _sbox('Visits', '$totalVisits', Icons.location_on_outlined, kAmber),
          ])),
          const SizedBox(height: 8),

          // ── Cash summary row ─────────────────────────────────────────
          StaggeredFadeIn(index: 3, child: Row(children: [
            _sbox('Customers', '$totalCustomers', Icons.people_outline_rounded, kNavy),
            const SizedBox(width: 8),
            _sbox('Deposited', 'PKR ${totalDeposited.toStringAsFixed(0)}', Icons.savings_outlined, kGreen),
            const SizedBox(width: 8),
            _sbox('Pending\nDeposit', 'PKR ${pendingDeposit.toStringAsFixed(0)}', Icons.pending_outlined, kAmber),
          ])),
          const SizedBox(height: 16),

          // ── Pending collections alert ────────────────────────────────
          if (pendingCount > 0) ...[
            StaggeredFadeIn(index: 4, child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: kAmber.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: kAmber.withValues(alpha: 0.35)),
              ),
              child: Row(children: [
                const Icon(Icons.schedule_rounded, color: kAmber, size: 20),
                const SizedBox(width: 10),
                Expanded(child: Text(
                  '$pendingCount pending collections — PKR ${pendingCollected.toStringAsFixed(0)} awaiting approval',
                  style: const TextStyle(color: kNavy, fontSize: 13, fontWeight: FontWeight.w600),
                )),
              ]),
            )),
            const SizedBox(height: 16),
          ],

          // ── Orders bar chart ─────────────────────────────────────────
          StaggeredFadeIn(index: 5, child: Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Orders by Status',
                  style: TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 15)),
              const SizedBox(height: 18),
              if (statusEntries.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 20),
                  child: Center(child: Text('No orders in this period.', style: TextStyle(color: kTextMuted))),
                )
              else
                SizedBox(
                  height: 180,
                  child: AnimatedBuilder(
                    animation: _chartAnim,
                    builder: (_, __) => BarChart(BarChartData(
                      alignment: BarChartAlignment.spaceAround,
                      maxY: maxCount * 1.4,
                      barTouchData: BarTouchData(enabled: true),
                      titlesData: FlTitlesData(
                        bottomTitles: AxisTitles(sideTitles: SideTitles(
                          showTitles: true,
                          getTitlesWidget: (v, m) {
                            final idx = v.toInt();
                            if (idx < 0 || idx >= statusEntries.length) return const SizedBox();
                            return Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(statusEntries[idx].key,
                                  style: const TextStyle(color: kTextMuted, fontSize: 9)),
                            );
                          },
                        )),
                        leftTitles: AxisTitles(sideTitles: SideTitles(
                          showTitles: true, reservedSize: 28,
                          getTitlesWidget: (v, m) => Text(v.toStringAsFixed(0),
                              style: const TextStyle(color: kTextMuted, fontSize: 9)),
                        )),
                        topTitles:   const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      ),
                      borderData: FlBorderData(show: false),
                      gridData:   const FlGridData(show: false),
                      barGroups: statusEntries.asMap().entries.map((e) => BarChartGroupData(
                        x: e.key,
                        barRods: [BarChartRodData(
                          toY: e.value.value.toDouble() * _chartAnim.value,
                          color: _statusColor(e.value.key),
                          width: 28,
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                        )],
                      )).toList(),
                    )),
                  ),
                ),
            ]),
          )),
          const SizedBox(height: 16),

          // ── Customer Breakdown ───────────────────────────────────────
          if (customerBreakdown.isNotEmpty) ...[
            StaggeredFadeIn(index: 6, child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8)],
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Customer Breakdown',
                    style: TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 15)),
                const SizedBox(height: 4),
                const Text('Orders, sales & collection this period',
                    style: TextStyle(color: kTextMuted, fontSize: 11)),
                const SizedBox(height: 14),
                // Header
                Row(children: const [
                  Expanded(flex: 3, child: Text('Customer', style: TextStyle(color: kTextMuted, fontSize: 11, fontWeight: FontWeight.w700))),
                  Expanded(flex: 2, child: Text('Sales', textAlign: TextAlign.right, style: TextStyle(color: kTextMuted, fontSize: 11, fontWeight: FontWeight.w700))),
                  Expanded(flex: 2, child: Text('Collected', textAlign: TextAlign.right, style: TextStyle(color: kTextMuted, fontSize: 11, fontWeight: FontWeight.w700))),
                  Expanded(flex: 2, child: Text('Outstanding', textAlign: TextAlign.right, style: TextStyle(color: kTextMuted, fontSize: 11, fontWeight: FontWeight.w700))),
                ]),
                const Divider(height: 16),
                ...customerBreakdown.map((c) {
                  final sales       = _n(c['sales']);
                  final collected   = _n(c['collected']);
                  final outstanding = _n(c['outstanding']);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Row(children: [
                      Expanded(flex: 3, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text((c['name'] ?? '').toString(),
                            style: const TextStyle(color: kNavy, fontSize: 12, fontWeight: FontWeight.w700),
                            overflow: TextOverflow.ellipsis),
                        if ((c['contact'] ?? '').toString().isNotEmpty)
                          Text(c['contact'].toString(),
                              style: const TextStyle(color: kTextMuted, fontSize: 10),
                              overflow: TextOverflow.ellipsis),
                        Text('${c['orders'] ?? 0} orders',
                            style: const TextStyle(color: kTextMuted, fontSize: 10)),
                      ])),
                      Expanded(flex: 2, child: Text('PKR ${sales.toStringAsFixed(0)}',
                          textAlign: TextAlign.right,
                          style: const TextStyle(color: kNavy, fontSize: 12, fontWeight: FontWeight.w700))),
                      Expanded(flex: 2, child: Text('PKR ${collected.toStringAsFixed(0)}',
                          textAlign: TextAlign.right,
                          style: const TextStyle(color: kGreen, fontSize: 12, fontWeight: FontWeight.w700))),
                      Expanded(flex: 2, child: Text('PKR ${outstanding.toStringAsFixed(0)}',
                          textAlign: TextAlign.right,
                          style: TextStyle(
                              color: outstanding > 0 ? kRed : kTextMuted,
                              fontSize: 12, fontWeight: FontWeight.w700))),
                    ]),
                  );
                }),
              ]),
            )),
            const SizedBox(height: 16),
          ],

          // ── Recent Orders ────────────────────────────────────────────
          if (orders.isNotEmpty) ...[
            StaggeredFadeIn(index: 7, child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8)],
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Recent Orders',
                    style: TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 15)),
                const SizedBox(height: 12),
                ...orders.take(8).toList().asMap().entries.map((e) =>
                    StaggeredFadeIn(index: e.key, child: _orderRow(e.value))),
              ]),
            )),
          ],

          const SizedBox(height: 30),
        ],
      ),
    );
  }

  Widget _miniStat(String label, String value, Color color) {
    return Column(children: [
      Text(value, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 13)),
      const SizedBox(height: 2),
      Text(label, style: const TextStyle(color: Colors.white54, fontSize: 10)),
    ]);
  }

  Widget _vDivider() => Container(width: 1, height: 30, color: Colors.white.withValues(alpha: 0.15));

  Widget _sbox(String label, String value, IconData icon, Color color) {
    return Expanded(child: Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 6)],
      ),
      child: Column(children: [
        Container(
          width: 34, height: 34,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, color: color, size: 16),
        ),
        const SizedBox(height: 6),
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(value, style: TextStyle(fontWeight: FontWeight.w800, color: color, fontSize: 14)),
        ),
        Text(label, textAlign: TextAlign.center,
            style: const TextStyle(color: kTextMuted, fontSize: 10, height: 1.2)),
      ]),
    ));
  }

  Widget _orderRow(Map<String, dynamic> o) {
    final id       = (o['id'] ?? '').toString();
    final shortId  = id.length >= 8 ? id.substring(0, 8).toUpperCase() : id;
    final status   = (o['status'] ?? '').toString();
    final amount   = _n(o['total_amount']);
    final color    = _statusColor(status);
    final customer = (o['users'] as Map?)?['full_name'] as String? ?? '';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
          child: Icon(Icons.receipt_long_outlined, size: 16, color: color),
        ),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('ORD-$shortId', style: const TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 12)),
          if (customer.isNotEmpty)
            Text(customer, style: const TextStyle(color: kTextMuted, fontSize: 11)),
        ])),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('PKR ${amount.toStringAsFixed(0)}',
              style: const TextStyle(color: kNavy, fontSize: 12, fontWeight: FontWeight.w700)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(6)),
            child: Text(status, style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w700)),
          ),
        ]),
      ]),
    );
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'delivered':  return kGreen;
      case 'cancelled':
      case 'undelivered': return kRed;
      case 'pending':    return kAmber;
      default:           return kNavy;
    }
  }
}
