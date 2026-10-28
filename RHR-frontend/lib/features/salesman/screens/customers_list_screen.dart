import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/shimmer_box.dart';
import '../../../shared/widgets/premium_ui.dart';
import '../../../shared/router/app_transitions.dart';

class CustomersListScreen extends StatefulWidget {
  const CustomersListScreen({super.key});

  @override
  State<CustomersListScreen> createState() => _CustomersListScreenState();
}

class _CustomersListScreenState extends State<CustomersListScreen> {
  List<Map<String, dynamic>> _customers = [];
  bool _isLoading = true;
  String _search = '';
  bool _isDriver = false;

  @override
  void initState() {
    SecureStorage.getRole().then((r) {
      if (r == 'driver' && mounted) setState(() => _isDriver = true);
    });
    super.initState();
    _loadCustomers();
  }

  Future<void> _loadCustomers() async {
    try {
      final response = await DioClient.instance.get(ApiEndpoints.customers);
      if (response.data['success'] == true) {
        var customers = List<Map<String, dynamic>>.from(response.data['data'] ?? []);
        final role = await SecureStorage.getRole();
        if (role == 'salesman') {
          final myId = await SecureStorage.getUserId();
          if (myId != null) {
            customers = customers.where((c) => c['salesman_id'] == myId).toList();
          }
        }
        setState(() => _customers = customers);
      }
    } catch (e) {
      debugPrint('Customers error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  num _asNum(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '0') ?? 0;

  String _lastOrderLabel(String? iso) {
    if (iso == null) return 'No orders yet';
    final date = DateTime.tryParse(iso);
    if (date == null) return 'No orders yet';
    final days = DateTime.now().difference(date).inDays;
    if (days == 0) return 'Last order: Today';
    if (days == 1) return 'Last order: Yesterday';
    return 'Last order: $days days ago';
  }

  List<Map<String, dynamic>> get _filtered => _customers
      .where((c) => '${c['full_name'] ?? ''} ${c['shop_name'] ?? ''}'
          .toLowerCase().contains(_search.toLowerCase()))
      .toList();

  String _shopOf(Map<String, dynamic> c) => (c['shop_name'] ?? '').toString().trim();
  String _titleOf(Map<String, dynamic> c) =>
      _shopOf(c).isNotEmpty ? _shopOf(c) : (c['full_name'] ?? '').toString();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCardBg,
      appBar: premiumAppBar(
        _isDriver ? 'All Customers' : 'My Customers',
        subtitle: '${_customers.length} total',
        onBack: () => goBack(context, _isDriver ? '/driver-dashboard' : '/salesman-dashboard'),
      ),
      body: Column(
        children: [
          PremiumSearchBar(
            hint: 'Search by name, shop or phone...',
            onChanged: (v) => setState(() => _search = v),
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          ),
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              child: _isLoading
                  ? ListView.builder(
                      key: const ValueKey('loading'),
                      padding: const EdgeInsets.all(16),
                      itemCount: 6,
                      itemBuilder: (_, i) => const ShimmerListRow(),
                    )
                  : RefreshIndicator(
                      key: const ValueKey('list'),
                      color: kGreen,
                      onRefresh: _loadCustomers,
                      child: _filtered.isEmpty
                          ? ListView(
                              physics: const AlwaysScrollableScrollPhysics(),
                              children: const [PremiumEmpty(icon: Icons.people_outline, title: 'No customers found')],
                            )
                          : ListView.builder(
                              physics: const AlwaysScrollableScrollPhysics(),
                              padding: const EdgeInsets.only(top: 4, bottom: 80),
                              itemCount: _filtered.length,
                              itemBuilder: (_, i) {
                                final c = _filtered[i];
                                final outstanding = _asNum(c['outstanding_balance']);
                                final initials = _titleOf(c).isNotEmpty ? _titleOf(c)[0].toUpperCase() : '?';
                                return StaggeredFadeIn(
                                  index: i,
                                  child: PremiumCard(
                                    onTap: () => context.push('/customer-detail', extra: c['id'] as String),
                                    child: Row(children: [
                                      CircleAvatar(
                                        radius: 22,
                                        backgroundColor: kNavy.withValues(alpha: 0.08),
                                        child: Text(initials,
                                            style: const TextStyle(color: kNavy, fontWeight: FontWeight.w700, fontSize: 15)),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                        Text(_titleOf(c),
                                            style: const TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 14)),
                                        if (_shopOf(c).isNotEmpty && (c['full_name'] ?? '').toString().isNotEmpty)
                                          Text(c['full_name'].toString(),
                                              style: const TextStyle(color: kTextMuted, fontSize: 11)),
                                        if ((c['phone'] ?? '').isNotEmpty)
                                          Text(c['phone'].toString(),
                                              style: const TextStyle(color: kTextMuted, fontSize: 11)),
                                        const SizedBox(height: 2),
                                        Text(_lastOrderLabel(c['last_order_date'] as String?),
                                            style: const TextStyle(color: kTextMuted, fontSize: 11)),
                                      ])),
                                      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                        if (!_isDriver)
                                          GestureDetector(
                                            onTap: () async {
                                              final updated = await context.push<bool>(
                                                  '/edit-customer', extra: c['id'] as String);
                                              if (updated == true && mounted) _loadCustomers();
                                            },
                                            child: Container(
                                              padding: const EdgeInsets.all(6),
                                              decoration: BoxDecoration(
                                                  color: kNavy.withValues(alpha: 0.07),
                                                  borderRadius: BorderRadius.circular(8)),
                                              child: const Icon(Icons.edit_outlined, size: 16, color: kNavy),
                                            ),
                                          ),
                                        const SizedBox(height: 4),
                                        if (outstanding > 0)
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                            decoration: BoxDecoration(
                                                color: kRed.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(8)),
                                            child: Text('PKR ${outstanding.toStringAsFixed(0)}',
                                                style: const TextStyle(color: kRed, fontWeight: FontWeight.w700, fontSize: 12)),
                                          )
                                        else
                                          const Icon(Icons.chevron_right_rounded, color: kTextMuted, size: 18),
                                        if (c['credit_limit'] != null)
                                          Text('Limit: PKR ${_asNum(c['credit_limit']).toStringAsFixed(0)}',
                                              style: const TextStyle(color: kTextMuted, fontSize: 10)),
                                      ]),
                                    ]),
                                  ),
                                );
                              },
                            ),
                    ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: kNavy,
        onPressed: () => context.push('/create-order'),
        icon: const Icon(Icons.add_rounded, color: Colors.white),
        label: const Text('New Order', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      ),
    );
  }
}
