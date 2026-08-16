import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/shimmer_box.dart';

class CustomerDetailScreen extends StatefulWidget {
  final String? customerId;
  const CustomerDetailScreen({super.key, this.customerId});

  @override
  State<CustomerDetailScreen> createState() => _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends State<CustomerDetailScreen> {
  Map<String, dynamic>? _customer;
  List<Map<String, dynamic>> _ledger  = [];
  num _outstandingBalance = 0;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    if (widget.customerId != null) _loadData();
  }

  Future<void> _loadData() async {
    try {
      // Load customer profile
      final custRes = await DioClient.instance.get(
          '${ApiEndpoints.customers}/${widget.customerId}');
      if (custRes.data['success'] == true) {
        _customer = custRes.data['data'] as Map<String, dynamic>;
      }

      // Load ledger (outstanding balance)
      // GET /ledger/:id returns { entries, currentBalance } — not a bare array
      final ledgerRes = await DioClient.instance.get(
          '${ApiEndpoints.ledger}${widget.customerId}');
      if (ledgerRes.data['success'] == true) {
        final ledgerData = ledgerRes.data['data'] as Map<String, dynamic>? ?? {};
        _ledger = List<Map<String, dynamic>>.from(ledgerData['entries'] ?? []);
        _outstandingBalance = (ledgerData['currentBalance'] ?? 0) as num;
      }

      setState(() {});
    } catch (e) {
      debugPrint('Customer detail error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final name  = _customer?['full_name'] ?? '—';
    final phone = _customer?['phone']     ?? '—';
    final addr  = _customer?['address']   ?? '';

    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => context.go('/my-customers'),
        ),
        title: Text(name,
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: _isLoading
          ? ListView(
              padding: const EdgeInsets.all(20),
              children: const [
                ShimmerBox(height: 100, borderRadius: BorderRadius.all(Radius.circular(16))),
                SizedBox(height: 16),
                ShimmerListRow(),
                ShimmerListRow(),
                ShimmerListRow(),
              ],
            )
          : _customer == null
              ? const Center(
                  child: Text('Customer not found.',
                      style: TextStyle(color: AppColors.steelBlue)))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Profile card
                      StaggeredFadeIn(index: 0, child: Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: AppColors.navy,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Row(
                          children: [
                            const CircleAvatar(
                              radius: 32,
                              backgroundColor: AppColors.orange,
                              child: Icon(Icons.business,
                                  color: Colors.white, size: 32),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(name,
                                      style: const TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.bold,
                                          fontSize: 18)),
                                  Text(phone,
                                      style: const TextStyle(
                                          color: Colors.white60, fontSize: 13)),
                                  if (addr.isNotEmpty)
                                    Text(addr,
                                        style: const TextStyle(
                                            color: Colors.white60,
                                            fontSize: 13)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      )),
                      const SizedBox(height: 16),

                      // Stats
                      Row(
                        children: [
                          Expanded(child: StaggeredFadeIn(index: 1, child: _statCard(
                              'Outstanding',
                              'PKR $_outstandingBalance',
                              AppColors.orange))),
                          const SizedBox(width: 12),
                          Expanded(child: StaggeredFadeIn(index: 2, child: _statCard(
                              'Ledger Entries',
                              '${_ledger.length}',
                              AppColors.navy))),
                        ],
                      ),
                      const SizedBox(height: 20),

                      // Action buttons
                      Row(
                        children: [
                          Expanded(
                            child: RHRButton(
                              text: 'New Order',
                              onPressed: () => context.go('/create-order'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: RHRButton(
                              text: 'Record Payment',
                              onPressed: () => context.go('/record-payment', extra: widget.customerId),
                              isSecondary: true,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),

                      // Ledger entries
                      const Text('Ledger',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: AppColors.navy)),
                      const SizedBox(height: 12),
                      if (_ledger.isEmpty)
                        const Text('No ledger entries.',
                            style: TextStyle(color: AppColors.steelBlue))
                      else
                        ..._ledger.asMap().entries.map((mapEntry) {
                          final entry  = mapEntry.value;
                          final desc   = entry['description'] ?? entry['notes'] ?? 'Entry';
                          final amount = entry['amount'] ?? entry['debit'] ?? 0;
                          final date   = (entry['created_at'] ?? '').toString();
                          final shortDate = date.length >= 10
                              ? date.substring(0, 10)
                              : date;
                          return StaggeredFadeIn(
                              index: mapEntry.key,
                              child: _ledgerRow(desc, shortDate, 'PKR $amount'));
                        }),
                    ],
                  ),
                ),
    );
  }

  Widget _statCard(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)
        ],
      ),
      child: Column(
        children: [
          Text(value,
              style: TextStyle(
                  fontWeight: FontWeight.bold, color: color, fontSize: 14)),
          const SizedBox(height: 4),
          Text(label,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: AppColors.steelBlue, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _ledgerRow(String desc, String date, String amount) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(desc,
                    style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: AppColors.navy,
                        fontSize: 13)),
                Text(date,
                    style: const TextStyle(
                        color: AppColors.steelBlue, fontSize: 11)),
              ],
            ),
          ),
          Text(amount,
              style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  color: AppColors.orange,
                  fontSize: 13)),
        ],
      ),
    );
  }
}
