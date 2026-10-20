import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/storage/secure_storage.dart';
import 'gps_service.dart';
import 'push_service.dart';
import '../core/features/app_features.dart';

/// Single logout path for every screen — stops GPS tracking (harmless
/// no-op if it was never running, e.g. for a customer), clears secure
/// storage, and replaces the whole navigation stack with /login.
class AuthService {
  static Future<void> logout(BuildContext context) async {
    await PushService.unregister(); // while the login token still exists
    await GPSService().stopTracking();
    await AppFeatures.clear();
    await SecureStorage.clearAll();
    if (context.mounted) {
      GoRouter.of(context).go('/login');
    }
  }
}
