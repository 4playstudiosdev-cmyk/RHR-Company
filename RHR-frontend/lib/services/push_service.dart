import 'dart:async';
import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../core/network/dio_client.dart';
import '../core/storage/secure_storage.dart';
import '../shared/router/app_router.dart';

/// Phone push notifications (Firebase Cloud Messaging).
///
/// Everything that appears in the app's Notifications list is also pushed to
/// the phone, so it shows in the notification bar even when the app is closed.
/// The notification itself is always saved on the server first — push is only
/// the "ping" — so any failure in here is swallowed and never affects the app.
///
///  * [init] — at app start: Firebase, the notification channel, foreground
///    display, and tap handling (app in background / closed).
///  * [registerToken] — after login (and on app start / resume): sends this
///    phone's token to the server so it knows where to ping this account.
///  * [unregister] — on logout: the phone stops receiving this account's pings.
class PushService {
  static const _channelId = 'rhr_default';
  static final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();
  static bool _ready = false;
  static String? _lastSentToken;
  static DateTime? _lastSentAt;

  static Future<void> init() async {
    try {
      await Firebase.initializeApp();
      _ready = true;

      await _local.initialize(
        settings: const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
        onDidReceiveNotificationResponse: (resp) {
          final payload = resp.payload;
          if (payload == null || payload.isEmpty) return;
          try {
            _open(Map<String, dynamic>.from(jsonDecode(payload) as Map));
          } catch (_) {/* not ours */}
        },
      );
      await _local
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(const AndroidNotificationChannel(
            _channelId,
            'RHR & Company',
            description: 'Orders, payments and account updates',
            importance: Importance.high,
          ));

      // App open: Android doesn't draw a push by itself, so show it ourselves.
      FirebaseMessaging.onMessage.listen(_showInForeground);
      // Tapped while the app was in the background.
      FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(m.data));
      // Firebase renewed the token.
      // ignore: deprecated_member_use
      FirebaseMessaging.instance.onTokenRefresh.listen((t) => registerToken(token: t));

      // Tapped while the app was closed: open once the UI is up.
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) {
        Future.delayed(const Duration(seconds: 2), () => _open(initial.data));
      }
    } catch (e) {
      debugPrint('PushService.init failed (push disabled): $e');
    }
  }

  /// Sends this phone's push token to the server for the logged-in account.
  static Future<void> registerToken({String? token}) async {
    if (!_ready) return;
    try {
      if (!await SecureStorage.isLoggedIn()) return;
      final messaging = FirebaseMessaging.instance;
      // Android 13+ asks the user; older Android grants it silently.
      await messaging.requestPermission();
      // ignore: deprecated_member_use
      final t = token ?? await messaging.getToken();
      if (t == null || t.isEmpty) return;
      // Same token already sent recently — nothing to do.
      if (t == _lastSentToken && _lastSentAt != null && DateTime.now().difference(_lastSentAt!) < const Duration(hours: 12)) {
        return;
      }
      final res = await DioClient.instance.post('/api/v1/auth/fcm-token', data: {'token': t});
      if (res.data['success'] == true) {
        _lastSentToken = t;
        _lastSentAt = DateTime.now();
      }
    } catch (e) {
      debugPrint('PushService.registerToken failed: $e');
    }
  }

  /// Logout: tell the server this phone no longer belongs to the account.
  /// Call BEFORE the session is cleared (it needs the login token).
  static Future<void> unregister() async {
    if (!_ready) return;
    try {
      _lastSentToken = null;
      _lastSentAt = null;
      await DioClient.instance.delete('/api/v1/auth/fcm-token');
    } catch (e) {
      debugPrint('PushService.unregister failed: $e');
    }
  }

  static Future<void> _showInForeground(RemoteMessage m) async {
    final n = m.notification;
    if (n == null) return;
    await _local.show(
      id: m.hashCode & 0x7fffffff,
      title: n.title,
      body: n.body,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          'RHR & Company',
          channelDescription: 'Orders, payments and account updates',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      payload: jsonEncode(m.data),
    );
  }

  /// A tapped notification opens whatever it is about — same routing as the
  /// in-app Notifications list.
  static Future<void> _open(Map<String, dynamic> data) async {
    try {
      if (!await SecureStorage.isLoggedIn()) return;
      final type = (data['type'] ?? '').toString();
      final ref = (data['reference_id'] ?? '').toString();
      if ((type == 'order' || type == 'order_urgent') && ref.isNotEmpty) {
        appRouter.push('/order-tracking', extra: ref);
        return;
      }
      if (type == 'payment') {
        final role = await SecureStorage.getRole();
        if (role == 'salesman') {
          appRouter.push('/salesman-payments-collected');
          return;
        }
        if (role == 'customer') {
          appRouter.push('/payment-history');
          return;
        }
      }
      appRouter.push('/notifications');
    } catch (e) {
      debugPrint('PushService._open failed: $e');
    }
  }
}

/// Background / terminated isolate entry point. Firebase itself shows the
/// notification (the server sends a `notification` payload); nothing to do here
/// except exist, so the plugin can wake the app's isolate.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {/* already initialised */}
}
