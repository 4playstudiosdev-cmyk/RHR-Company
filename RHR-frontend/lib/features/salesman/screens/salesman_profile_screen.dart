import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../services/gps_service.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/staggered_fade_in.dart';

class SalesmanProfileScreen extends StatefulWidget {
  const SalesmanProfileScreen({super.key});

  @override
  State<SalesmanProfileScreen> createState() => _SalesmanProfileScreenState();
}

class _SalesmanProfileScreenState extends State<SalesmanProfileScreen> {
  String _name  = 'Salesman';
  String _phone = '';

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
  }

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
                    bottomLeft: Radius.circular(28), bottomRight: Radius.circular(28)),
              ),
              child: Column(
                children: [
                  const CircleAvatar(
                    radius: 44,
                    backgroundColor: AppColors.orange,
                    child: Icon(Icons.handshake_outlined, size: 44, color: Colors.white),
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
                      color: AppColors.orange.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.orange),
                    ),
                    child: const Text('Salesman',
                        style: TextStyle(color: AppColors.orange, fontWeight: FontWeight.bold, fontSize: 13)),
                  ),
                ],
              ),
            )),
            const SizedBox(height: 24),

            // Menu Items
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: StaggeredFadeIn(index: 1, child: Container(
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)],
                ),
                child: Column(
                  children: [
                    _menuItem(Icons.people_outline, 'My Customers', () => context.go('/my-customers')),
                    const Divider(height: 1, indent: 56),
                    _menuItem(Icons.map_outlined, 'Customer Map', () => context.go('/customer-map')),
                    const Divider(height: 1, indent: 56),
                    _menuItem(Icons.bar_chart_outlined, 'My Performance', () => context.go('/performance')),
                    const Divider(height: 1, indent: 56),
                    _menuItem(Icons.event_available_outlined, 'Attendance', () => context.go('/attendance')),
                    const Divider(height: 1, indent: 56),
                    _menuItem(Icons.event_busy_outlined, 'Apply Leave', () => context.go('/leave')),
                    const Divider(height: 1, indent: 56),
                    _menuItem(Icons.request_page_outlined, 'My Payslip', () => context.go('/payslip')),
                    const Divider(height: 1, indent: 56),
                    _menuItem(Icons.location_on_outlined, 'GPS Tracking', () => context.go('/gps-tracking')),
                  ],
                ),
              )),
            ),
            const SizedBox(height: 20),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: StaggeredFadeIn(index: 2, child: RHRButton(
                text: 'Logout',
                isSecondary: true,
                onPressed: () async {
                  await GPSService().stopTracking();
                  await SecureStorage.clearToken();
                  if (context.mounted) context.go('/login');
                },
              )),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
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
