import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../network/dio_client.dart';
import '../storage/secure_storage.dart';

/// Which parts of the app this customer / salesman / driver may use, as set by
/// the super admin (desktop → Mobile Access). Loaded from the server when a
/// home screen opens and whenever the app comes back to the foreground, and
/// cached so the last known switches apply before (or without) a connection.
///
/// `AppFeatures.has('new_order')` is true unless that feature was switched off;
/// the one exception is a driver's 'sales_access', which is off unless switched
/// on. Screens listen to [notifier] to redraw when the switches change.
/// The server enforces the important ones itself, so hiding a button here is
/// never the only protection.
class AppFeatures {
  static const String _boxName = 'app_features';
  static const String _key = 'features';

  // Same defaults as the backend (RHR-backend/src/utils/appFeatures.js).
  static const Set<String> _offByDefault = {'sales_access'};

  static final ValueNotifier<Map<String, bool>> notifier = ValueNotifier<Map<String, bool>>({});

  static bool has(String feature) =>
      notifier.value[feature] ?? !_offByDefault.contains(feature);

  /// Reads the cached switches (cheap; call once at startup).
  static Future<void> restore() async {
    try {
      final box = await Hive.openBox(_boxName);
      final raw = box.get(_key);
      if (raw is String && raw.isNotEmpty) {
        final map = (jsonDecode(raw) as Map).map((k, v) => MapEntry(k.toString(), v == true));
        notifier.value = map;
      }
    } catch (e) {
      debugPrint('AppFeatures restore failed: $e');
    }
  }

  /// Asks the server for the current switches and applies them. Quietly keeps
  /// the cached ones if the request fails (offline, session expired...).
  static Future<void> load() async {
    try {
      // Never ask while logged out (login / OTP screens): the server answers 401,
      // and the app's 401 handler treats that as an expired session and throws
      // the user back to the login screen — which is what kicked people off the
      // OTP screen the moment the app came back to the foreground.
      if (!await SecureStorage.isLoggedIn()) return;
      final res = await DioClient.instance.get('/api/v1/auth/my-features');
      if (res.data['success'] != true) return;
      final features = res.data['data']?['features'];
      if (features is! Map) return; // admins have no switches
      final map = features.map((k, v) => MapEntry(k.toString(), v == true));
      notifier.value = map;
      final box = await Hive.openBox(_boxName);
      await box.put(_key, jsonEncode(map));
    } catch (e) {
      debugPrint('AppFeatures load failed: $e');
    }
  }

  /// On logout — the next person to log in on this phone starts from defaults.
  static Future<void> clear() async {
    notifier.value = {};
    try {
      final box = await Hive.openBox(_boxName);
      await box.delete(_key);
    } catch (_) {}
  }
}
