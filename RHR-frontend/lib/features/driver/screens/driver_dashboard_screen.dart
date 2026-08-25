import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../services/gps_service.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';

class DriverDashboardScreen extends StatefulWidget {
  const DriverDashboardScreen({super.key});

  @override
  State<DriverDashboardScreen> createState() => _DriverDashboardScreenState();
}

class _DriverDashboardScreenState extends State<DriverDashboardScreen> {
  String _name = 'Driver';
  String _carNumber = '';
  String _driverId = '';

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final name = await SecureStorage.getFullName();
    final carNumber = await SecureStorage.getCarNumber();
    final userId = await SecureStorage.getUserId();
    if (!mounted) return;
    setState(() {
      if (name != null && name.isNotEmpty) _name = name;
      if (carNumber != null && carNumber.isNotEmpty) _carNumber = carNumber;
      if (userId != null && userId.length >= 8) {
        _driverId = 'DRV-${userId.substring(0, 8).toUpperCase()}';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isTracking = GPSService().isTracking;
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            children: [
              // Header
              Container(
                padding: const EdgeInsets.all(24),
                decoration: const BoxDecoration(
                  color: AppColors.navy,
                  borderRadius: BorderRadius.only(
                    bottomLeft: Radius.circular(28),
                    bottomRight: Radius.circular(28),
                  ),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: GestureDetector(
                            onTap: () => context.go('/driver-profile'),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Welcome,',
                                    style: TextStyle(color: Colors.white70, fontSize: 13)),
                                Text(_name,
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 20,
                                        fontWeight: FontWeight.bold)),
                              ],
                            ),
                          ),
                        ),
                        GestureDetector(
                          onTap: () => context.go('/notifications'),
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.1),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.notifications_outlined, color: Colors.white),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Expanded(child: StaggeredFadeIn(index: 0, child: _infoCard(
                            Icons.badge_outlined, 'Driver ID', _driverId.isEmpty ? '—' : _driverId))),
                        const SizedBox(width: 12),
                        Expanded(child: StaggeredFadeIn(index: 1, child: _infoCard(
                            Icons.directions_car_outlined, 'Car Number', _carNumber.isEmpty ? '—' : _carNumber))),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // GPS status card
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: StaggeredFadeIn(index: 2, child: TapScale(
                  onTap: () => context.go('/driver-gps-tracking'),
                  child: Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: isTracking ? AppColors.success.withValues(alpha: 0.1) : AppColors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: isTracking ? AppColors.success : AppColors.outlineVariant),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
                    ),
                    child: Row(
                      children: [
                        Icon(isTracking ? Icons.location_on : Icons.location_off,
                            color: isTracking ? AppColors.success : AppColors.disabled, size: 28),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(isTracking ? 'GPS Active — Location Shared' : 'GPS Inactive',
                                  style: TextStyle(fontWeight: FontWeight.bold, color: isTracking ? AppColors.success : AppColors.navy)),
                              const Text('Office can see your live location while active',
                                  style: TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                            ],
                          ),
                        ),
                        const Icon(Icons.arrow_forward_ios, size: 14, color: AppColors.steelBlue),
                      ],
                    ),
                  ),
                )),
              ),
              const SizedBox(height: 24),

              // My Tools
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text('My Tools',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.navy)),
                ),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 0.95,
                  children: [
                    _toolItem(context, Icons.location_on_outlined, 'GPS Tracking', '/driver-gps-tracking', 0),
                    _toolItem(context, Icons.person_outline, 'My Profile', '/driver-profile', 1),
                    _toolItem(context, Icons.event_available_outlined, 'Attendance', '/attendance', 2),
                    _toolItem(context, Icons.event_busy_outlined, 'Apply Leave', '/leave', 3),
                    _toolItem(context, Icons.request_page_outlined, 'My Payslip', '/payslip', 4),
                    _toolItem(context, Icons.notifications_outlined, 'Notifications', '/notifications', 5),
                  ],
                ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoCard(IconData icon, String label, String value) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white24),
      ),
      child: Column(
        children: [
          Icon(icon, color: AppColors.orange, size: 20),
          const SizedBox(height: 6),
          Text(value,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
              overflow: TextOverflow.ellipsis),
          Text(label, style: const TextStyle(color: Colors.white60, fontSize: 10)),
        ],
      ),
    );
  }

  Widget _toolItem(BuildContext context, IconData icon, String label, String route, int index) {
    return StaggeredFadeIn(
      index: index,
      child: TapScale(
        onTap: () => context.go(route),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: AppColors.orange, size: 24),
              const SizedBox(height: 8),
              Text(label, textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 11, color: AppColors.navy, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }
}
