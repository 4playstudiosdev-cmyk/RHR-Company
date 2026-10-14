import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:geolocator/geolocator.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/location/location_service.dart';
import '../../../core/storage/secure_storage.dart';

/// Blocks the app entirely until location access is granted — reached
/// when the launch-time disclosure is declined, or the OS permission/
/// location service isn't actually on. No way around this screen except
/// granting access or exiting the app (per the explicit requirement
/// that the app must not be usable without location).
class LocationRequiredScreen extends StatefulWidget {
  const LocationRequiredScreen({super.key});

  @override
  State<LocationRequiredScreen> createState() => _LocationRequiredScreenState();
}

class _LocationRequiredScreenState extends State<LocationRequiredScreen> {
  bool _checking = false;

  Future<void> _retry() async {
    setState(() => _checking = true);
    try {
      final serviceOn = await LocationService.ensureLocationServiceOn();
      if (!serviceOn) return;

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.deniedForever) {
        // Can't re-prompt — only the system Settings screen can fix this.
        await Geolocator.openAppSettings();
        return;
      }
      if (permission == LocationPermission.denied) return;

      await SecureStorage.saveLocationConsent(true);
      await SecureStorage.saveShopLocationConsent(true);
      if (mounted) context.go('/splash');
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: AppColors.navy,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Icon(Icons.location_off, color: Colors.white, size: 72),
              const SizedBox(height: 24),
              const Text('Location Access Required',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
              const SizedBox(height: 14),
              const Text(
                'RHR & Company needs your location to work — for delivery '
                'tracking, field visits, and shop locations. The app can\'t '
                'be used until location access is turned on.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white70, fontSize: 14, height: 1.5),
              ),
              const SizedBox(height: 36),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _checking ? null : _retry,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.orange,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _checking
                      ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                      : const Text('Enable Location', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(height: 14),
              TextButton(
                onPressed: () => SystemNavigator.pop(),
                child: const Text('Exit App', style: TextStyle(color: Colors.white54)),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
