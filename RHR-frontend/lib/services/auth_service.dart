import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/storage/secure_storage.dart';
import 'gps_service.dart';
import 'push_service.dart';
import '../core/features/app_features.dart';
import '../core/network/api_cache.dart';
import '../core/storage/sync_service.dart';

/// Single logout path for every screen — stops GPS tracking (harmless
/// no-op if it was never running, e.g. for a customer), clears secure
/// storage, and replaces the whole navigation stack with /login.
class AuthService {
  static Future<void> logout(BuildContext context) async {
    // Send anything saved offline while this user's login still exists. What
    // can't be sent now stays on the phone, tagged with this user, and is sent
    // the next time they log in — never under someone else's account.
    try { await SyncService.syncAll(); } catch (_) {}
    await PushService.unregister(); // while the login token still exists
    await GPSService().stopTracking();
    await AppFeatures.clear();
    await SecureStorage.clearAll();
    await ApiCache.clear(); // the next person on this phone must not see this user's data
    if (context.mounted) {
      GoRouter.of(context).go('/login');
    }
  }
}
