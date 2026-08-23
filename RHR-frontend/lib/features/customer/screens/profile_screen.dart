import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../core/location/location_service.dart';
import '../../../services/auth_service.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/staggered_fade_in.dart';

const _cityNames = {
  '1e5962c6-33a7-460b-913e-9e08db46973a': 'Karachi (Head Office)',
  '09a1fda3-7ac0-406a-8f42-75d973dc3b7e': 'Hyderabad',
  '00f79d89-0d36-4704-8865-fc7bbd66226c': 'Sukkur',
};

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  String _name  = 'Customer';
  String _phone = '';
  String _business = '';
  String _city = '';
  String _outstanding = 'PKR 0';
  String _totalOrders = '0';
  String _totalPaid = 'PKR 0';
  bool _hasShopLocation = false;
  bool _settingLocation = false;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final role = await SecureStorage.getRole();
    if (role == 'salesman') {
      if (mounted) context.go('/salesman-profile');
      return;
    }
    final name  = await SecureStorage.getFullName();
    final phone = await SecureStorage.getPhone();
    if (!mounted) return;
    setState(() {
      if (name  != null && name.isNotEmpty)  _name  = name;
      if (phone != null && phone.isNotEmpty) _phone = phone;
    });

    final userId = await SecureStorage.getUserId();
    if (userId == null) return;
    try {
      final res = await DioClient.instance.get('${ApiEndpoints.customers}/$userId');
      if (res.data['success'] == true) {
        final data = res.data['data'] as Map<String, dynamic>;
        if (!mounted) return;
        setState(() {
          _business = (data['shop_name'] as String?) ?? '';
          _city     = _cityNames[data['company_id']] ?? '';
          _hasShopLocation = data['shop_latitude'] != null && data['shop_longitude'] != null;
        });
      }
    } catch (e) {
      debugPrint('Profile load error: $e');
    }

    try {
      final ledgerRes = await DioClient.instance.get('${ApiEndpoints.ledger}$userId');
      if (ledgerRes.data['success'] == true) {
        final ledgerData = ledgerRes.data['data'] as Map<String, dynamic>? ?? {};
        final balance = (ledgerData['currentBalance'] ?? 0) as num;
        if (mounted) setState(() => _outstanding = 'PKR ${balance.toStringAsFixed(0)}');
      }
    } catch (e) {
      debugPrint('Profile ledger error: $e');
    }

    try {
      final ordersRes = await DioClient.instance.get(ApiEndpoints.orders);
      if (ordersRes.data['success'] == true) {
        final orders = List<dynamic>.from(ordersRes.data['data'] ?? []);
        if (mounted) setState(() => _totalOrders = '${orders.length}');
      }
    } catch (e) {
      debugPrint('Profile orders error: $e');
    }

    try {
      final paymentsRes = await DioClient.instance.get(ApiEndpoints.payments);
      if (paymentsRes.data['success'] == true) {
        final payments = List<Map<String, dynamic>>.from(paymentsRes.data['data'] ?? []);
        final total = payments
            .where((p) => p['customer_id'] == userId && p['status'] == 'approved')
            .fold<num>(0, (s, p) => s + ((p['amount'] ?? 0) as num));
        if (mounted) setState(() => _totalPaid = 'PKR ${total.toStringAsFixed(0)}');
      }
    } catch (e) {
      debugPrint('Profile payments error: $e');
    }
  }

  Future<void> _setShopLocation() async {
    setState(() => _settingLocation = true);
    try {
      final pos = await LocationService.getCurrentPosition();
      if (pos == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Location permission denied — enable it to set your shop location.')));
        }
        return;
      }
      final res = await DioClient.instance.patch(
        '${ApiEndpoints.customers}/me/location',
        data: {'latitude': pos.latitude, 'longitude': pos.longitude},
      );
      if (res.data['success'] == true) {
        if (mounted) {
          setState(() => _hasShopLocation = true);
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Shop location saved!'), backgroundColor: AppColors.success));
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(res.data['message'] ?? 'Failed to save location')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _settingLocation = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final initial = _name.isNotEmpty ? _name[0].toUpperCase() : 'C';
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => context.go('/home'),
        ),
        title: const Text('My Profile',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            // Header
            StaggeredFadeIn(index: 0, scale: true, child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(28),
              decoration: const BoxDecoration(
                color: AppColors.navy,
                borderRadius: BorderRadius.only(
                  bottomLeft: Radius.circular(28),
                  bottomRight: Radius.circular(28)),
              ),
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 44,
                    backgroundColor: AppColors.orange,
                    child: Text(initial,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 36, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(height: 14),
                  Text(_name,
                    style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text(_phone,
                    style: const TextStyle(color: Colors.white60, fontSize: 14)),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.success.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.success),
                    ),
                    child: const Text('Account Active',
                      style: TextStyle(color: AppColors.success, fontWeight: FontWeight.bold, fontSize: 13)),
                  ),
                ],
              ),
            )),
            const SizedBox(height: 20),

            // Business / City info
            if (_business.isNotEmpty || _city.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: StaggeredFadeIn(index: 1, child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: AppColors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)],
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    if (_business.isNotEmpty)
                      Row(children: [
                        const Icon(Icons.storefront_outlined, color: AppColors.orange, size: 18),
                        const SizedBox(width: 8),
                        Expanded(child: Text(_business,
                            style: const TextStyle(color: AppColors.orange, fontSize: 14, fontWeight: FontWeight.w600))),
                      ]),
                    if (_business.isNotEmpty && _city.isNotEmpty) const SizedBox(height: 10),
                    if (_city.isNotEmpty)
                      Row(children: [
                        const Icon(Icons.location_city, color: AppColors.steelBlue, size: 18),
                        const SizedBox(width: 8),
                        Expanded(child: Text(_city,
                            style: const TextStyle(color: AppColors.steelBlue, fontSize: 13))),
                      ]),
                  ]),
                )),
              ),
            const SizedBox(height: 20),

            // Balance Card
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: StaggeredFadeIn(index: 2, child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
                ),
                child: Column(
                  children: [
                    Container(height: 4, margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(color: AppColors.orange, borderRadius: BorderRadius.circular(2))),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _balanceItem('Outstanding', _outstanding, AppColors.orange),
                        Container(width: 1, height: 40, color: AppColors.warmGrey),
                        _balanceItem('Total Orders', _totalOrders, AppColors.navy),
                        Container(width: 1, height: 40, color: AppColors.warmGrey),
                        _balanceItem('Total Paid', _totalPaid, AppColors.success),
                      ],
                    ),
                  ],
                ),
              )),
            ),
            const SizedBox(height: 20),

            // Menu Items
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: StaggeredFadeIn(index: 3, child: Container(
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)],
                ),
                child: Column(
                  children: [
                    _menuItem(Icons.receipt_long_outlined, 'My Orders', () => context.go('/orders')),
                    const Divider(height: 1, indent: 56),
                    _menuItem(Icons.account_balance_wallet_outlined, 'Account Ledger', () => context.go('/ledger')),
                    const Divider(height: 1, indent: 56),
                    _menuItem(Icons.download_outlined, 'Download Statement', () => context.go('/payment-history')),
                    const Divider(height: 1, indent: 56),
                    _menuItem(Icons.person_pin_circle_outlined, 'Track My Salesman', () => context.go('/track-salesman')),
                    const Divider(height: 1, indent: 56),
                    ListTile(
                      leading: const Icon(Icons.storefront_outlined, color: AppColors.navy),
                      title: Text(
                        _hasShopLocation ? 'Update Shop Location' : 'Set Shop Location',
                        style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w500),
                      ),
                      subtitle: _hasShopLocation
                          ? const Text('Location saved', style: TextStyle(color: AppColors.success, fontSize: 12))
                          : const Text('Not set yet — helps salesmen find your shop',
                              style: TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                      trailing: _settingLocation
                          ? const SizedBox(
                              width: 18, height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.orange))
                          : const Icon(Icons.arrow_forward_ios, size: 14, color: AppColors.steelBlue),
                      onTap: _settingLocation ? null : _setShopLocation,
                    ),
                    const Divider(height: 1, indent: 56),
                    _menuItem(Icons.help_outline, 'Help & Support', () {}),
                  ],
                ),
              )),
            ),
            const SizedBox(height: 20),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: StaggeredFadeIn(index: 4, child: RHRButton(
                text: 'Logout',
                onPressed: () => AuthService.logout(context),
                isSecondary: true,
              )),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _balanceItem(String label, String value, Color color) {
    return Column(
      children: [
        Text(value, style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 15)),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
      ],
    );
  }

  Widget _menuItem(IconData icon, String label, VoidCallback onTap) {
    return ListTile(
      leading: Icon(icon, color: AppColors.navy),
      title: Text(label, style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w500)),
      trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: AppColors.steelBlue),
      onTap: onTap,
    );
  }
}
