import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../core/network/dio_client.dart';

/// Sends a GPS ping every [_interval] while tracking is active, and queues
/// pings in Hive when offline or when a send fails — flushing the whole
/// queue via POST /gps/batch-ping the next time a ping succeeds.
class GPSService {
  static final GPSService _instance = GPSService._internal();
  factory GPSService() => _instance;
  GPSService._internal();

  static const String _boxName = 'gps_offline';
  static const Duration _interval = Duration(minutes: 2);

  Timer? _timer;
  Box? _offlineBox;
  bool _isTracking = false;

  bool get isTracking => _isTracking;
  int get pendingOfflineCount => _offlineBox?.length ?? 0;

  Future<void> initialize() async {
    _offlineBox ??= await Hive.openBox(_boxName);
  }

  Future<bool> startTracking() async {
    if (_isTracking) return true;
    await initialize();

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return false;
    }

    _isTracking = true;
    unawaited(_captureAndSend());
    _timer = Timer.periodic(_interval, (_) => _captureAndSend());
    return true;
  }

  Future<void> stopTracking() async {
    _timer?.cancel();
    _timer = null;
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
