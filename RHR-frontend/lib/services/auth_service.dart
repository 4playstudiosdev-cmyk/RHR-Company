import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/storage/secure_storage.dart';
import 'gps_service.dart';

/// Single logout path for every screen — stops GPS tracking (harmless
/// no-op if it was never running, e.g. for a customer), clears secure
/// storage, and replaces the whole navigation stack with /login.
class AuthService {
  static Future<void> logout(BuildContext context) async {
    await GPSService().stopTracking();
    await SecureStorage.clearAll();
    if (context.mounted) {
      GoRouter.of(context).go('/login');
    }
  }
}
