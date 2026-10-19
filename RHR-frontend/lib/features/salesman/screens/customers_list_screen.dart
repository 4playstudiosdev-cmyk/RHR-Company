import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';
import '../../../shared/widgets/shimmer_box.dart';
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

  bool _isDriver = false; // a driver with sales access sees every customer of the branch

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
        var customers = List<Map<String, dynamic>>.from(
            response.data['data'] ?? []);

        // Defense in depth — the backend already scopes this list to the
        // authenticated salesman's own customers; this is just a
        // belt-and-suspenders filter in case that scoping ever regresses.
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
          .toLowerCase()
          .contains(_search.toLowerCase()))
      .toList();

  // Shop / business name is the headline, the person's own name sits under it.
  String _shopOf(Map<String, dynamic> c) => (c['shop_name'] ?? '').toString().trim();
  String _titleOf(Map<String, dynamic> c) =>
      _shopOf(c).isNotEmpty ? _shopOf(c) : (c['full_name'] ?? '').toString();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => goBack(context, _isDriver ? '/driver-dashboard' : '/salesman-dashboard'),
        ),
        title: Text(_isDriver ? 'All Customers' : 'My Customers',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              onChanged: (v) => setState(() => _search = v),
              decoration: InputDecoration(
                hintText: 'Search customers...',
                hintStyle: const TextStyle(color: Colors.white54),
                prefixIcon: const Icon(Icons.search, color: Colors.white54),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.15),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
              ),
              style: const TextStyle(color: Colors.white),
            ),
          ),
        ),
      ),
      body: AnimatedSwitcher(
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
                color: AppColors.orange,
                onRefresh: _loadCustomers,
                child: _filtered.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        Padding(
                          padding: EdgeInsets.only(top: 80),
                          child: Center(child: Text('No customers found.',
                              style: TextStyle(color: AppColors.steelBlue))),
                        ),
                      ],
                    )
                  : ListView.builder(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  itemCount: _filtered.length,
                  itemBuilder: (_, i) {
                    final c = _filtered[i];
                    return StaggeredFadeIn(
                      index: i,
                      child: TapScale(
                      onTap: () => context.push('/customer-detail',
                          extra: c['id'] as String),
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 12),
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
                              child: Icon(Icons.business,
                                  color: Colors.white, size: 20),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(_titleOf(c),
                                      style: const TextStyle(
                                          fontWeight: FontWeight.bold,
                                          color: AppColors.navy,
                                          fontSize: 15)),
                                  if (_shopOf(c).isNotEmpty && (c['full_name'] ?? '').toString().isNotEmpty)
                                    Text(c['full_name'].toString(),
                                        style: const TextStyle(
                                            color: AppColors.steelBlue,
                                            fontSize: 11)),
                                  Text(c['phone'] ?? '',
                                      style: const TextStyle(
                                          color: AppColors.steelBlue,
                                          fontSize: 12)),
                                  const SizedBox(height: 4),
                                  Text(_lastOrderLabel(c['last_order_date'] as String?),
                                      style: const TextStyle(
                                          color: AppColors.steelBlue,
                                          fontSize: 11)),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                if (_asNum(c['outstanding_balance']) > 0)
                                  Text('PKR ${_asNum(c['outstanding_balance']).toStringAsFixed(0)}',
                                      style: const TextStyle(
                                          color: AppColors.error,
                                          fontWeight: FontWeight.bold,
                                          fontSize: 13)),
                                if (c['credit_limit'] != null)
                                  Text('Limit: PKR ${_asNum(c['credit_limit']).toStringAsFixed(0)}',
                                      style: const TextStyle(
                                          color: AppColors.steelBlue,
                                          fontSize: 10)),
                                const SizedBox(height: 4),
                                const Icon(Icons.arrow_forward_ios,
                                    size: 12, color: AppColors.steelBlue),
                              ],
                            ),
                          ],
                        ),
                      ),
                      ),
                    );
                  },
                ),
              ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.orange,
        onPressed: () => context.push('/create-order'),
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('New Order',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
    );
  }
}
