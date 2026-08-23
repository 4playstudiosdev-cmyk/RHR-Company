import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';
import '../../../shared/widgets/shimmer_box.dart';

class CustomersListScreen extends StatefulWidget {
  const CustomersListScreen({super.key});

  @override
  State<CustomersListScreen> createState() => _CustomersListScreenState();
}

class _CustomersListScreenState extends State<CustomersListScreen> {
  List<Map<String, dynamic>> _customers = [];
  bool _isLoading = true;
  String _search = '';

  @override
  void initState() {
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

  List<Map<String, dynamic>> get _filtered => _customers
      .where((c) => (c['full_name'] ?? '')
          .toLowerCase()
          .contains(_search.toLowerCase()))
      .toList();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => context.go('/salesman-dashboard'),
        ),
        title: const Text('My Customers',
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
            : _filtered.isEmpty
              ? const Center(
                  key: ValueKey('empty'),
                  child: Text('No customers found.',
                      style: TextStyle(color: AppColors.steelBlue)))
              : ListView.builder(
                  key: const ValueKey('list'),
                  padding: const EdgeInsets.all(16),
                  itemCount: _filtered.length,
                  itemBuilder: (_, i) {
                    final c = _filtered[i];
                    return StaggeredFadeIn(
                      index: i,
                      child: TapScale(
                      onTap: () => context.go('/customer-detail',
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
                                  Text(c['full_name'] ?? '',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.bold,
                                          color: AppColors.navy,
                                          fontSize: 15)),
                                  Text(c['phone'] ?? '',
                                      style: const TextStyle(
                                          color: AppColors.steelBlue,
                                          fontSize: 12)),
                                ],
                              ),
                            ),
                            const Icon(Icons.arrow_forward_ios,
                                size: 12, color: AppColors.steelBlue),
                          ],
                        ),
                      ),
                      ),
                    );
                  },
                ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.orange,
        onPressed: () => context.go('/create-order'),
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('New Order',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
    );
  }
}
