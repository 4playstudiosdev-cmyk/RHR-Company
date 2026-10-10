import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../widgets/location_disclosure_dialog.dart';

/// First screen the app shows. Briefly displays branding, then decides
/// where to send the user based on whatever session state already exists
/// (same check app_router.dart's redirect does for direct navigation to
/// /login, duplicated here since this runs once up front instead).
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _decideNextRoute();
  }

  Future<void> _decideNextRoute() async {
    await Future.delayed(const Duration(milliseconds: 1400));
    if (!mounted) return;

    // Google Play requires this shown BEFORE any location-permission
    // prompt, for every role — shown here, right after splash and before
    // the login screen (or dashboard, on a restored session), since the
    // role isn't known yet at this point. Cleared on logout along with
    // everything else in SecureStorage, so it re-prompts on next login
    // too, not just once per install.
    if (!await SecureStorage.getLocationConsent()) {
      if (!mounted) return;
      final accepted = await showAppLaunchLocationDisclosureDialog(context);
      if (accepted) {
        await SecureStorage.saveLocationConsent(true);
        await SecureStorage.saveShopLocationConsent(true);
      }
    }

    if (!mounted) return;
    if (await SecureStorage.isLoggedIn()) {
      final role = await SecureStorage.getRole();
      if (!mounted) return;
      if (role == 'salesman') {
        context.go('/salesman-dashboard');
      } else if (role == 'driver') {
        context.go('/driver-dashboard');
      } else {
        context.go('/home');
      }
    } else {
      if (!mounted) return;
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surfaceContainerLowest,
      body: SafeArea(
        child: Stack(children: [
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Image.asset('assets/images/rhr-logo.jpeg', width: 190, height: 190, fit: BoxFit.contain),
                const SizedBox(height: AppSpacing.base),
                Text('Premium Tile Bond & Grout Manufacturer',
                    textAlign: TextAlign.center,
                    style: AppTextStyles.headlineLgMobile.copyWith(color: AppColors.primary, fontSize: 22)),
                const SizedBox(height: AppSpacing.lg),
                Text('KARACHI · HYDERABAD · SUKKUR',
                    style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 2)),
              ],
            ),
          ),
          Positioned(
            left: 0, right: 0, bottom: 0,
            child: Column(children: [
              Text('DreamByte Studio', style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant, fontSize: 10)),
              const SizedBox(height: AppSpacing.xs),
              const SizedBox(
                height: 3,
                child: LinearProgressIndicator(
                  backgroundColor: AppColors.surfaceContainerHigh,
                  valueColor: AlwaysStoppedAnimation(AppColors.primary),
                ),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
