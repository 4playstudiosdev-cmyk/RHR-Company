import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../core/location/location_service.dart';
import '../core/network/dio_client.dart';
import '../core/storage/secure_storage.dart';
import '../widgets/location_disclosure_dialog.dart';
import 'gps_task_handler.dart';

/// Starts / stops / checks the background location task for salesmen and
/// drivers. The actual position reading and uploading happens in
/// [GpsTaskHandler], inside an Android foreground service with its own Dart
/// isolate — that is what lets tracking continue with the screen off, with
/// another app in front, and even after the app is swiped away from Recents,
/// until [stopTracking] (logout / session gone) or the person turns location
/// off on the phone. (Tracking that lived inside the app's own UI isolate
/// died the moment the app was swiped away.)
///
/// Android always shows a notification for such a service; it can't be hidden.
/// Some phones (TECNO HiOS, Xiaomi, Oppo...) also need the app exempted from
/// battery optimisation / allowed to auto-start — see BackgroundTrackingHelper.
class GPSService {
  static final GPSService _instance = GPSService._internal();
  factory GPSService() => _instance;
  GPSService._internal();

  // The old in-app queue. Newer builds queue inside the background task; this
  // box is only drained of whatever an older version left behind.
  static const String _boxName = 'gps_offline';
  Box? _offlineBox;
  bool _isTracking = false;
  bool _inited = false;

  bool get isTracking => _isTracking;
  int get pendingOfflineCount => _offlineBox?.length ?? 0;
  // Shown on the GPS Tracking screen.
  static String get intervalLabel => '5s';

  Future<void> initialize() async {
    _offlineBox ??= await Hive.openBox(_boxName);
  }

  /// Google Play policy requires a prominent in-app disclosure BEFORE the
  /// OS location-permission prompt. Call this instead of [startTracking]
  /// directly from any screen that still has a valid [context] right
  /// after login (see login_screen.dart/otp_screen.dart) — it shows the
  /// disclosure dialog once (skips it if already accepted this session),
  /// then only proceeds to the real permission request/tracking if the
  /// user tapped "I Understand & Allow".
  Future<bool> startTrackingWithConsent(BuildContext context) async {
    final alreadyConsented = await SecureStorage.getLocationConsent();
    if (!alreadyConsented) {
      if (!context.mounted) return false;
      final accepted = await showLocationDisclosureDialog(context);
      if (!accepted) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Location access is required for salesman features')),
          );
        }
        return false;
      }
      await SecureStorage.saveLocationConsent(true);
    }
    return startTracking();
  }

  void _configure() {
    if (_inited) return;
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'rhr_duty_mode',
        channelName: 'Duty Mode',
        channelDescription: 'Shown while you are on duty.',
        channelImportance: NotificationChannelImportance.LOW,
        priority: NotificationPriority.LOW,
        onlyAlertOnce: true,
      ),
      iosNotificationOptions: const IOSNotificationOptions(showNotification: false, playSound: false),
      foregroundTaskOptions: ForegroundTaskOptions(
        // The task's watchdog tick (see GpsTaskHandler.onRepeatEvent).
        eventAction: ForegroundTaskEventAction.repeat(30000),
        autoRunOnBoot: false,
        autoRunOnMyPackageReplaced: false,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );
    _inited = true;
  }

  Future<bool> startTracking() async {
    // Defense in depth — every current call site already checks role
    // before calling this, but that means the guard only exists at the
    // edges; anyone adding a new call site later gets it for free by
    // enforcing it here too. Customers and admins are never tracked.
    final role = await SecureStorage.getRole();
    if (role != 'salesman' && role != 'delivery' && role != 'driver') {
      debugPrint('GPS tracking skipped — role: $role');
      return false;
    }

    await initialize();
    _configure();

    // Already running (it survives the app being swiped away) — leave it be.
    if (await FlutterForegroundTask.isRunningService) {
      _isTracking = true;
      unawaited(_drainLegacyQueue());
      return true;
    }

    // Prompts the native "Turn on Location?" dialog if GPS is off —
    // see LocationService.ensureLocationServiceOn for why Geolocator
    // alone can't do this.
    if (!await LocationService.ensureLocationServiceOn()) {
      debugPrint('GPS tracking skipped — location service is off');
      return false;
    }

    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return false;
      }
    } catch (e) {
      // e.g. a permission request already in flight, or location services
      // unavailable — tracking just doesn't start; never an app error.
      debugPrint('GPS permission check failed: $e');
      return false;
    }

    try {
      final result = await FlutterForegroundTask.startService(
        serviceId: 4101,
        serviceTypes: [ForegroundServiceTypes.location],
        notificationTitle: 'RHR Company',
        notificationText: 'Duty mode is on',
        callback: gpsStartCallback,
      );
      if (result is ServiceRequestFailure) {
        debugPrint('GPS service failed to start: ${result.error}');
        return false;
      }
    } catch (e) {
      debugPrint('GPS service start failed: $e');
      return false;
    }

    _isTracking = true;
    unawaited(_drainLegacyQueue());
    return true;
  }

  /// Call when the app returns to the foreground and at startup: starts the
  /// background task if it isn't running (it may have been killed by the
  /// phone's battery manager), and picks up the real state if it is.
  Future<void> ensureTracking() async {
    try {
      final token = await SecureStorage.getToken();
      final role = await SecureStorage.getRole();
      if (token == null || (role != 'salesman' && role != 'driver' && role != 'delivery')) return;
      _configure();
      _isTracking = await FlutterForegroundTask.isRunningService;
      if (!_isTracking) await startTracking();
    } catch (e) {
      debugPrint('ensureTracking failed: $e'); // never break the app over tracking
    }
  }

  /// [sync] is kept for the callers that pass it (see dio_client.dart's 401
  /// handler): stopping never needs a valid session.
  Future<void> stopTracking({bool sync = true}) async {
    _isTracking = false;
    try {
      if (await FlutterForegroundTask.isRunningService) {
        await FlutterForegroundTask.stopService();
      }
    } catch (e) {
      debugPrint('GPS service stop failed: $e');
    }
    if (sync) unawaited(_drainLegacyQueue());
  }

  // ── leftovers from older versions ──────────────────────────────────────
  bool _isSyncing = false;

  Future<void> _drainLegacyQueue() async {
    final box = _offlineBox;
    if (box == null || box.isEmpty || _isSyncing) return;
    _isSyncing = true;
    try {
      final keys = box.keys.toList();
      final pings = keys
          .map((key) => box.get(key))
          .where((raw) => raw != null)
          .map((raw) => Map<String, dynamic>.from(raw!))
          .toList();
      if (pings.isEmpty) return;
      final response = await DioClient.instance.post(
        '/api/v1/gps/batch-ping',
        data: {'pings': pings},
      );
      if (response.data['success'] == true) {
        for (final key in keys) {
          await box.delete(key);
        }
      }
    } catch (e) {
      debugPrint('GPS legacy sync failed: $e');
    } finally {
      _isSyncing = false;
    }
  }
}
