import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../services/auth_service.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/premium_ui.dart';
import '../../../shared/router/app_transitions.dart';

class SalesmanProfileScreen extends StatefulWidget {
  const SalesmanProfileScreen({super.key});

  @override
  State<SalesmanProfileScreen> createState() => _SalesmanProfileScreenState();
}

class _SalesmanProfileScreenState extends State<SalesmanProfileScreen> {
  String _name     = 'Salesman';
  String _phone    = '';
  String _photoUrl = '';

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final name  = await SecureStorage.getFullName();
    final phone = await SecureStorage.getPhone();
    if (!mounted) return;
    setState(() {
      if (name != null && name.isNotEmpty) _name = name;
      if (phone != null && phone.isNotEmpty) _phone = phone;
    });
    try {
      final res = await DioClient.instance.get(ApiEndpoints.salesmanMyProfile);
      if (res.data['success'] == true && mounted) {
        setState(() => _photoUrl = (res.data['data']?['profile_photo_url'] ?? '').toString());
      }
    } catch (e) {
      debugPrint('Profile photo load error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final initials = _name.isNotEmpty ? _name[0].toUpperCase() : 'S';
    return Scaffold(
      backgroundColor: kCardBg,
      appBar: premiumAppBar(
        'My Profile',
        onBack: () => goBack(context, '/salesman-dashboard'),
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            // Hero section
            StaggeredFadeIn(
              index: 0,
              scale: true,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(24, 32, 24, 28),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [kNavyDark, kNavyLight],
                  ),
                  borderRadius: BorderRadius.only(
                    bottomLeft:  Radius.circular(28),
                    bottomRight: Radius.circular(28),
                  ),
                ),
                child: Column(children: [
                  // Avatar
                  Container(
                    width: 90, height: 90,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white.withValues(alpha: 0.3), width: 3),
                    ),
                    child: CircleAvatar(
                      radius: 44,
                      backgroundColor: Colors.white.withValues(alpha: 0.15),
                      backgroundImage: _photoUrl.isNotEmpty ? NetworkImage(_photoUrl) : null,
                      child: _photoUrl.isEmpty
                          ? Text(initials,
                              style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800))
                          : null,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(_name,
                      style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                  const SizedBox(height: 4),
                  if (_phone.isNotEmpty)
                    Text(_phone, style: const TextStyle(color: Colors.white54, fontSize: 13)),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.white24),
                    ),
                    child: const Text('FIELD SALES OFFICER',
                        style: TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.8)),
                  ),
                ]),
              ),
            ),
            const SizedBox(height: 24),

            // Menu
            StaggeredFadeIn(
              index: 1,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)],
                  ),
                  child: Column(children: [
                    _menuItem(Icons.edit_outlined, 'Edit Profile', () => context.push('/salesman-profile-setup')),
                    _divider(),
                    _menuItem(Icons.people_outline_rounded, 'My Customers', () => context.push('/my-customers')),
                    _divider(),
                    _menuItem(Icons.bar_chart_rounded, 'My Performance', () => context.push('/performance')),
                    _divider(),
                    _menuItem(Icons.event_available_outlined, 'Attendance', () => context.push('/attendance')),
                    _divider(),
                    _menuItem(Icons.request_page_outlined, 'My Payslip', () => context.push('/payslip')),
                  ]),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Logout
            StaggeredFadeIn(
              index: 2,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: GestureDetector(
                  onTap: () => AuthService.logout(context),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: kRed.withValues(alpha: 0.4)),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 8)],
                    ),
                    child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(Icons.logout_rounded, color: kRed, size: 18),
                      SizedBox(width: 8),
                      Text('Logout', style: TextStyle(color: kRed, fontWeight: FontWeight.w700, fontSize: 15)),
                    ]),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _divider() => const Divider(height: 1, indent: 56, endIndent: 0);

  Widget _menuItem(IconData icon, String label, VoidCallback onTap) {
    return ListTile(
      leading: Container(
        width: 36, height: 36,
        decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, color: kNavy, size: 18),
      ),
      title: Text(label, style: const TextStyle(color: kNavy, fontWeight: FontWeight.w600, fontSize: 14)),
      trailing: const Icon(Icons.chevron_right_rounded, size: 18, color: kTextMuted),
      onTap: onTap,
    );
  }
}
