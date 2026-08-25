import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../services/auth_service.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/staggered_fade_in.dart';

class DriverProfileScreen extends StatefulWidget {
  const DriverProfileScreen({super.key});

  @override
  State<DriverProfileScreen> createState() => _DriverProfileScreenState();
}

class _DriverProfileScreenState extends State<DriverProfileScreen> {
  String _name = 'Driver';
  String _phone = '';
  String _carNumber = '';
  String _driverId = '';

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final name = await SecureStorage.getFullName();
    final phone = await SecureStorage.getPhone();
    final carNumber = await SecureStorage.getCarNumber();
    final userId = await SecureStorage.getUserId();
    if (!mounted) return;
    setState(() {
      if (name != null && name.isNotEmpty) _name = name;
      if (phone != null && phone.isNotEmpty) _phone = phone;
      if (carNumber != null && carNumber.isNotEmpty) _carNumber = carNumber;
      if (userId != null && userId.length >= 8) {
        _driverId = 'DRV-${userId.substring(0, 8).toUpperCase()}';
      }
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
          onPressed: () => context.go('/driver-dashboard'),
        ),
        title: const Text('My Profile',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
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
                    child: Icon(Icons.local_shipping_outlined, size: 44, color: Colors.white),
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
                    child: const Text('Driver',
                        style: TextStyle(color: AppColors.orange, fontWeight: FontWeight.bold, fontSize: 13)),
                  ),
                ],
              ),
            )),
            const SizedBox(height: 24),

            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: StaggeredFadeIn(index: 1, child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)],
                ),
                child: Column(
                  children: [
                    _detailRow(Icons.badge_outlined, 'Driver ID', _driverId.isEmpty ? '—' : _driverId),
                    const Divider(height: 24),
                    _detailRow(Icons.directions_car_outlined, 'Car Number', _carNumber.isEmpty ? 'Not set' : _carNumber),
                  ],
                ),
              )),
            ),
            const SizedBox(height: 20),

            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: StaggeredFadeIn(index: 2, child: Container(
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)],
                ),
                child: Column(
                  children: [
                    _menuItem(Icons.location_on_outlined, 'GPS Tracking', () => context.go('/driver-gps-tracking')),
                    const Divider(height: 1, indent: 56),
                    _menuItem(Icons.event_available_outlined, 'Attendance', () => context.go('/attendance')),
                    const Divider(height: 1, indent: 56),
                    _menuItem(Icons.event_busy_outlined, 'Apply Leave', () => context.go('/leave')),
                    const Divider(height: 1, indent: 56),
                    _menuItem(Icons.request_page_outlined, 'My Payslip', () => context.go('/payslip')),
                  ],
                ),
              )),
            ),
            const SizedBox(height: 20),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: StaggeredFadeIn(index: 3, child: RHRButton(
                text: 'Logout',
                isSecondary: true,
                onPressed: () => AuthService.logout(context),
              )),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, color: AppColors.navy, size: 22),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(color: AppColors.steelBlue, fontSize: 12)),
              Text(value, style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.bold, fontSize: 15)),
            ],
          ),
        ),
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
