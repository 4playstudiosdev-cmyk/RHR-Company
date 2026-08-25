import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../core/location/location_service.dart';
import '../../../services/auth_service.dart';
import '../../../shared/widgets/rhr_bottom_nav.dart';

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
      backgroundColor: AppColors.background,
      body: SafeArea(
        bottom: false,
        child: SingleChildScrollView(
          child: Column(
            children: [
              // Wave header with avatar
              ClipPath(
                clipper: _ProfileWaveClipper(),
                child: Container(
                  width: double.infinity,
                  color: AppColors.primary,
                  padding: const EdgeInsets.fromLTRB(AppSpacing.marginMobile, AppSpacing.md, AppSpacing.marginMobile, 56),
                  child: Column(children: [
                    Container(
                      width: 88, height: 88,
                      decoration: BoxDecoration(
                        color: AppColors.primaryFixed,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.surface, width: 4),
                      ),
                      child: Center(child: Text(initial, style: AppTextStyles.headlineXl.copyWith(color: AppColors.onPrimaryFixed, fontSize: 32))),
                    ),
                    const SizedBox(height: AppSpacing.base),
                    Text(_name, style: AppTextStyles.headlineLgMobile.copyWith(color: Colors.white, fontSize: 22)),
                    const SizedBox(height: 4),
                    Text(_phone, style: AppTextStyles.bodyMd.copyWith(color: Colors.white70)),
                    if (_city.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.base),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(color: AppColors.surfaceContainerHighest, borderRadius: BorderRadius.circular(AppRadius.full)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.location_on, size: 14, color: AppColors.onSurface),
                          const SizedBox(width: 4),
                          Text(_city, style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurface)),
                        ]),
                      ),
                    ],
                  ]),
                ),
              ),

              Transform.translate(
                offset: const Offset(0, -36),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.marginMobile),
                  child: Column(children: [
                    // Stats bento
                    Row(children: [
                      Expanded(child: _StatTile(icon: Icons.inventory_2, value: _totalOrders, label: 'Orders', color: AppColors.primaryContainer)),
                      const SizedBox(width: AppSpacing.base),
                      Expanded(child: _StatTile(icon: Icons.account_balance_wallet, value: _outstanding, label: 'Outstanding', color: AppColors.error)),
                      const SizedBox(width: AppSpacing.base),
                      Expanded(child: _StatTile(icon: Icons.check_circle, value: _totalPaid, label: 'Paid', color: AppColors.success)),
                    ]),
                    if (_business.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.base),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(AppSpacing.sm),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceContainerLowest,
                          borderRadius: BorderRadius.circular(AppRadius.base),
                          border: Border.all(color: AppColors.outlineVariant),
                        ),
                        child: Row(children: [
                          const Icon(Icons.storefront, color: AppColors.tertiaryContainer, size: 18),
                          const SizedBox(width: 8),
                          Expanded(child: Text(_business, style: AppTextStyles.bodySm.copyWith(fontWeight: FontWeight.w600, color: AppColors.onSurface))),
                        ]),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.md),

                    // Menu list
                    Container(
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainerLowest,
                        borderRadius: BorderRadius.circular(AppRadius.lg),
                        border: Border.all(color: AppColors.outlineVariant),
                      ),
                      child: Column(children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.sm),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: Text('Account Settings', style: AppTextStyles.headlineSm.copyWith(color: AppColors.onSurface)),
                          ),
                        ),
                        const Divider(height: 1, color: AppColors.outlineVariant),
                        _menuItem(Icons.receipt_long, 'My Orders', () => context.go('/orders')),
                        const Divider(height: 1, indent: 56, color: AppColors.outlineVariant),
                        _menuItem(Icons.account_balance_wallet_outlined, 'Account Ledger', () => context.go('/ledger')),
                        const Divider(height: 1, indent: 56, color: AppColors.outlineVariant),
                        _menuItem(Icons.picture_as_pdf, 'Download Statement', () => context.go('/payment-history')),
                        const Divider(height: 1, indent: 56, color: AppColors.outlineVariant),
                        _menuItem(Icons.person_pin_circle_outlined, 'Track My Salesman', () => context.go('/track-salesman')),
                        const Divider(height: 1, indent: 56, color: AppColors.outlineVariant),
                        ListTile(
                          leading: const Icon(Icons.storefront, color: AppColors.primaryContainer),
                          title: Text(
                            _hasShopLocation ? 'Update Shop Location' : 'Set Shop Location',
                            style: AppTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600, color: AppColors.onSurface),
                          ),
                          subtitle: _hasShopLocation
                              ? Text('Location saved', style: AppTextStyles.bodySm.copyWith(color: AppColors.success))
                              : Text('Not set yet — helps salesmen find your shop', style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                          trailing: _settingLocation
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))
                              : const Icon(Icons.chevron_right, color: AppColors.onSurfaceVariant),
                          onTap: _settingLocation ? null : _setShopLocation,
                        ),
                        const Divider(height: 1, indent: 56, color: AppColors.outlineVariant),
                        _menuItem(Icons.support_agent, 'Help & Support', () {}),
                      ]),
                    ),
                    const SizedBox(height: AppSpacing.md),

                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () => AuthService.logout(context),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.error,
                          side: const BorderSide(color: AppColors.error),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                        ),
                        icon: const Icon(Icons.logout),
                        label: Text('Logout', style: AppTextStyles.bodyLg.copyWith(color: AppColors.error, fontWeight: FontWeight.bold)),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                  ]),
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: const RHRBottomNav(currentIndex: 3),
    );
  }

  Widget _menuItem(IconData icon, String label, VoidCallback onTap) {
    return ListTile(
      leading: Icon(icon, color: AppColors.primaryContainer),
      title: Text(label, style: AppTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600, color: AppColors.onSurface)),
      trailing: const Icon(Icons.chevron_right, color: AppColors.onSurfaceVariant),
      onTap: onTap,
    );
  }
}

class _StatTile extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  final Color color;
  const _StatTile({required this.icon, required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm, horizontal: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.outlineVariant),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Column(children: [
        Icon(icon, color: color, size: 24),
        const SizedBox(height: 6),
        Text(value, style: AppTextStyles.headlineSm.copyWith(color: AppColors.onSurface, fontSize: 15), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
        const SizedBox(height: 2),
        Text(label, style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant, fontSize: 11)),
      ]),
    );
  }
}

class _ProfileWaveClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final path = Path();
    path.lineTo(0, size.height - 32);
    path.quadraticBezierTo(size.width * 0.5, size.height, size.width, size.height - 32);
    path.lineTo(size.width, 0);
    path.close();
    return path;
  }

  @override
  bool shouldReclip(CustomClipper<Path> oldClipper) => false;
}
