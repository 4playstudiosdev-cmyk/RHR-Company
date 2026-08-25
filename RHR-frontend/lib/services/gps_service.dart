import 'dart:async';
import 'dart:ui';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../core/network/dio_client.dart';
import '../core/storage/secure_storage.dart';

/// Sends a GPS ping every [_interval] while tracking is active, and queues
/// pings in Hive when offline or when a send fails — flushing the whole
/// queue via POST /gps/batch-ping the next time a ping succeeds.
///
/// The actual ping loop runs inside an Android foreground service (see
/// [_onServiceStart] below), not a plain Timer on the UI isolate — a plain
/// Timer gets suspended by Doze/App Standby the moment the app is
/// backgrounded or the screen locks, which was why field-staff location
/// silently went stale on the desktop live map after a few minutes.
class GPSService {
  static final GPSService _instance = GPSService._internal();
  factory GPSService() => _instance;
  GPSService._internal();

  static const String _boxName = 'gps_offline';
  static const Duration _interval = Duration(minutes: 2);

  Box? _offlineBox;
  bool _isTracking = false;

  bool get isTracking => _isTracking;
  int get pendingOfflineCount => _offlineBox?.length ?? 0;

  Future<void> initialize() async {
    _offlineBox ??= await Hive.openBox(_boxName);
  }

  Future<bool> startTracking() async {
    if (_isTracking) return true;

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

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return false;
    }

    final service = FlutterBackgroundService();
    await service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: _onServiceStart,
        autoStart: false,
        isForegroundMode: true,
        notificationChannelId: 'rhr_gps_tracking',
        initialNotificationTitle: 'RHR & Company',
        initialNotificationContent: 'Sharing your location…',
        foregroundServiceNotificationId: 9002,
        foregroundServiceTypes: [AndroidForegroundType.location],
      ),
      iosConfiguration: IosConfiguration(),
    );
    await service.startService();

    _isTracking = true;
    return true;
  }

  Future<void> stopTracking() async {
    FlutterBackgroundService().invoke('stopService');
    _isTracking = false;
    await _syncOfflinePoints();
  }

  Future<void> _captureAndSend() async {
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );

      final ping = {
        'latitude': position.latitude,
        'longitude': position.longitude,
        'accuracy': position.accuracy,
        'status': 'moving',
        'timestamp': DateTime.now().toIso8601String(),
      };

      final connectivity = await Connectivity().checkConnectivity();
      final hasInternet = !connectivity.contains(ConnectivityResult.none);

      if (hasInternet) {
        try {
          await DioClient.instance.post('/api/v1/gps/ping', data: ping);
          await _syncOfflinePoints();
        } catch (e) {
          await _saveOffline(ping);
        }
      } else {
        await _saveOffline(ping);
      }
    } catch (e) {
      debugPrint('GPS capture error: $e');
    }
  }

  Future<void> _saveOffline(Map<String, dynamic> ping) async {
    await _offlineBox?.add(ping);
    debugPrint('GPS saved offline. Pending: ${_offlineBox?.length}');
  }

  Future<void> _syncOfflinePoints() async {
    final box = _offlineBox;
    if (box == null || box.isEmpty) return;

    final keys = box.keys.toList();
    final pings = keys
        .map((key) => box.get(key))
        .where((raw) => raw != null)
        .map((raw) => Map<String, dynamic>.from(raw!))
        .toList();
    if (pings.isEmpty) return;

    try {
      final response = await DioClient.instance.post(
        '/api/v1/gps/batch-ping',
        data: {'pings': pings},
      );
      if (response.data['success'] == true) {
        for (final key in keys) {
          await box.delete(key);
        }
        debugPrint('GPS sync complete. Uploaded ${pings.length} offline point(s)');
      }
    } catch (e) {
      debugPrint('GPS batch sync failed: $e');
    }
  }
}

/// Runs in its own background isolate (spawned by the Android foreground
/// service, not the app's UI isolate) — needs its own plugin registration
/// and its own Hive.initFlutter() before any of GPSService's Hive/Dio/
/// secure-storage calls will work.
@pragma('vm:entry-point')
void _onServiceStart(ServiceInstance service) async {
  DartPluginRegistrant.ensureInitialized();
  await Hive.initFlutter();

  if (service is AndroidServiceInstance) {
    service.setForegroundNotificationInfo(
      title: 'RHR & Company',
      content: 'Sharing your location…',
    );
  }

  final gps = GPSService();
  await gps.initialize();

  Timer? timer;
  Future<void> tick() async {
    if (!await SecureStorage.isLoggedIn()) {
      timer?.cancel();
      service.stopSelf();
      return;
    }
    await gps._captureAndSend();
  }

  await tick();
  timer = Timer.periodic(GPSService._interval, (_) => tick());

  service.on('stopService').listen((event) {
    timer?.cancel();
    service.stopSelf();
  });
}
