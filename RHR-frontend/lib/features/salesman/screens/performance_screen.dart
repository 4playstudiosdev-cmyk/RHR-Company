import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/staggered_fade_in.dart';

class PerformanceScreen extends StatefulWidget {
  const PerformanceScreen({super.key});

  @override
  State<PerformanceScreen> createState() => _PerformanceScreenState();
}

class _PerformanceScreenState extends State<PerformanceScreen> with SingleTickerProviderStateMixin {
  bool _isLoading = true;
  Map<String, dynamic>? _data;

  late final AnimationController _controller;
  late final Animation<double> _chartAnim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000));
    _chartAnim = CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic);
    _load();
  }

  Future<void> _load() async {
    setState(() => _isLoading = true);
    try {
      final userId = await SecureStorage.getUserId();
      final response = await DioClient.instance.get('/api/v1/analytics/salesman/$userId');
      if (response.data['success'] == true) {
        setState(() => _data = response.data['data'] as Map<String, dynamic>);
        _controller.forward();
      }
    } catch (e) {
      debugPrint('Performance error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final totalSales = ((_data?['totalSales'] ?? 0) as num).toDouble();
    final totalOrders = _data?['totalOrders'] ?? 0;
    final totalCustomers = _data?['totalCustomers'] ?? 0;
    final orders = List<Map<String, dynamic>>.from(_data?['orders'] ?? []);
    final payments = List<Map<String, dynamic>>.from(_data?['payments'] ?? []);

    final statusCounts = <String, int>{};
    for (final o in orders) {
      final s = (o['status'] ?? 'pending') as String;
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }
    final statusEntries = statusCounts.entries.toList();
    final maxCount = statusEntries.isEmpty
        ? 1.0
        : statusEntries.map((e) => e.value).reduce((a, b) => a > b ? a : b).toDouble();

    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => context.go('/salesman-dashboard')),
        title: const Text('My Performance',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : SingleChildScrollView(padding: const EdgeInsets.all(16), child: Column(children: [
        // Sales card
        Container(padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(20)),
            child: Column(children: [
              Text('Total Sales — ${_data?['period'] ?? ''}',
                  style: const TextStyle(color: Colors.white70, fontSize: 13)),
              const SizedBox(height: 8),
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: totalSales),
                duration: const Duration(milliseconds: 800),
                curve: Curves.easeOutCubic,
                builder: (context, value, _) => Text('PKR ${value.toStringAsFixed(0)}',
                    style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 4),
              Text('Collected: PKR ${(_data?['totalCollected'] ?? 0)}',
                  style: const TextStyle(color: AppColors.orange, fontSize: 13)),
            ])),
        const SizedBox(height: 16),
        // Stats
        Row(children: [
          StaggeredFadeIn(index: 0, child: _sbox('Orders', '$totalOrders', Icons.shopping_bag_outlined, AppColors.orange)),
          const SizedBox(width: 10),
          StaggeredFadeIn(index: 1, child: _sbox('Customers', '$totalCustomers', Icons.people_outline, AppColors.steelBlue)),
          const SizedBox(width: 10),
          StaggeredFadeIn(index: 2, child: _sbox('Collections', '${payments.length}', Icons.payments_outlined, AppColors.success)),
        ]),
        const SizedBox(height: 16),
        // Orders by status chart
        Container(padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(20),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 10)]),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Orders by Status', style: TextStyle(
                  fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 16)),
              const SizedBox(height: 20),
              if (statusEntries.isEmpty)
                const Padding(
                    padding: EdgeInsets.symmetric(vertical: 20),
                    child: Text('No orders this month.', style: TextStyle(color: AppColors.steelBlue)))
              else
                SizedBox(height: 180,
                    child: AnimatedBuilder(
                      animation: _chartAnim,
                      builder: (context, _) => BarChart(BarChartData(
                          alignment: BarChartAlignment.spaceAround,
                          maxY: maxCount * 1.3,
                          barTouchData: BarTouchData(enabled: true),
                          titlesData: FlTitlesData(
                              bottomTitles: AxisTitles(sideTitles: SideTitles(
                                  showTitles: true,
                                  getTitlesWidget: (v, m) {
                                    final idx = v.toInt();
                                    if (idx < 0 || idx >= statusEntries.length) return const SizedBox();
                                    return Text(statusEntries[idx].key,
                                        style: const TextStyle(color: AppColors.steelBlue, fontSize: 9));
                                  })),
                              leftTitles: AxisTitles(sideTitles: SideTitles(
                                  showTitles: true, reservedSize: 30,
                                  getTitlesWidget: (v, m) => Text(v.toStringAsFixed(0),
                                      style: const TextStyle(color: AppColors.steelBlue, fontSize: 9)))),
                              topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                              rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false))),
                          borderData: FlBorderData(show: false),
                          gridData: const FlGridData(show: false),
                          barGroups: statusEntries.asMap().entries.map((e) =>
                              BarChartGroupData(x: e.key, barRods: [
                                BarChartRodData(toY: e.value.value.toDouble() * _chartAnim.value,
                                    color: AppColors.orange, width: 24,
                                    borderRadius: const BorderRadius.vertical(top: Radius.circular(6)))
                              ])).toList())),
                    )),
            ])),
        const SizedBox(height: 16),
        Container(padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(16)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Recent Orders', style: TextStyle(
                  fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 15)),
              const SizedBox(height: 12),
              if (orders.isEmpty)
                const Text('No orders this month.', style: TextStyle(color: AppColors.steelBlue, fontSize: 13))
              else
                ...orders.take(5).toList().asMap().entries.map((e) => StaggeredFadeIn(
                    index: e.key, child: _orow(e.value))),
            ])),
      ])),
    );
  }

  Widget _sbox(String l, String v, IconData i, Color c) => Expanded(child: Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 6)]),
      child: Column(children: [
        Icon(i, color: c, size: 24), const SizedBox(height: 6),
        Text(v, style: TextStyle(fontWeight: FontWeight.bold, color: c, fontSize: 18)),
        Text(l, style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
      ])));

  Widget _orow(Map<String, dynamic> o) {
    final id = (o['id'] ?? '').toString();
    final shortId = id.length >= 8 ? id.substring(0, 8).toUpperCase() : id;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(children: [
        const CircleAvatar(radius: 18, backgroundColor: AppColors.warmGrey,
            child: Icon(Icons.receipt_long_outlined, size: 16, color: AppColors.navy)),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('ORD-$shortId', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 13)),
          Text((o['status'] ?? '').toString(), style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
        ])),
        Text('PKR ${o['total_amount'] ?? 0}', style: const TextStyle(color: AppColors.orange, fontSize: 12, fontWeight: FontWeight.bold)),
      ]));
  }
}
