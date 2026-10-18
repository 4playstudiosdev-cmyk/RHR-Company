import 'dart:async';
import 'dart:io' show Platform;
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../core/constants/api_endpoints.dart';
import '../core/storage/secure_storage.dart';

/// Entry point of the background tracking task. It runs in the foreground
/// service's OWN Dart isolate, not in the app's UI — so it keeps running
/// when the screen is off, another app is in front, or the app is swiped
/// away from Recents, until [FlutterForegroundTask.stopService] is called
/// (logout / the session going away) or the user turns location off.
@pragma('vm:entry-point')
void gpsStartCallback() {
  FlutterForegroundTask.setTaskHandler(GpsTaskHandler());
}

/// Reads the phone's position and uploads it to the backend.
///  * The position stream is attached with distanceFilter 0 so the OS keeps
///    delivering a fix every few seconds even when the phone is still; what
///    is uploaded is throttled: a move of 15 m+ ('moving'), or a heartbeat
///    ('idle') once a minute while stationary.
///  * A 30 s watchdog re-attaches the stream if no fix arrived for 90 s and
///    sends a heartbeat with the last known position, so a phone without GPS
///    signal still shows as online.
///  * No internet: pings queue in a small on-disk box and are uploaded in
///    one batch when the connection is back.
class GpsTaskHandler extends TaskHandler {
  static const double _moveThresholdMeters = 15;
  static const Duration _idlePingEvery = Duration(seconds: 60);
  static const Duration _silenceLimit = Duration(seconds: 90);
  static const String _queueBox = 'gps_offline_bg';

  StreamSubscription<Position>? _sub;
  Position? _lastPosition;
  Position? _lastUploadPos;
  DateTime? _lastUploadAt;
  DateTime _lastFixAt = DateTime.now();
  Box? _queue;
  Dio? _dio;
  bool _syncing = false;

  Dio get _http => _dio ??= Dio(BaseOptions(
        baseUrl: ApiEndpoints.baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {'Content-Type': 'application/json'},
        validateStatus: (s) => s != null && s < 500,
      ));

  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    try {
      await Hive.initFlutter();
      _queue = await Hive.openBox(_queueBox);
    } catch (e) {
      debugPrint('GPS task: queue unavailable ($e) — offline pings will be dropped');
    }
    _lastFixAt = DateTime.now();
    await _subscribe();
  }

  /// Called every 30 s (see ForegroundTaskOptions) — the watchdog.
  @override
  void onRepeatEvent(DateTime timestamp) {
    unawaited(_watchdog());
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {
    await _sub?.cancel();
    _sub = null;
    await _queue?.close();
  }

  LocationSettings _settings() {
    if (Platform.isAndroid) {
      // No foregroundNotificationConfig here: the foreground service is the
      // one this task already runs in.
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 0,
        intervalDuration: const Duration(seconds: 5),
      );
    }
    return LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 0);
  }

  Future<void> _subscribe() async {
    await _sub?.cancel();
    _sub = null;
    try {
      _sub = Geolocator.getPositionStream(locationSettings: _settings()).listen(
        _onFix,
        onError: (e) => debugPrint('GPS task stream error: $e'),
        cancelOnError: false,
      );
    } catch (e) {
      debugPrint('GPS task subscribe failed: $e');
    }
  }

  void _onFix(Position pos) {
    final now = DateTime.now();
    _lastFixAt = now;
    _lastPosition = pos;

    final last = _lastUploadPos;
    final lastAt = _lastUploadAt;
    String? status;
    if (last == null || lastAt == null) {
      status = 'moving';
    } else {
      final moved = Geolocator.distanceBetween(last.latitude, last.longitude, pos.latitude, pos.longitude);
      if (moved >= _moveThresholdMeters) {
        status = 'moving';
      } else if (now.difference(lastAt) >= _idlePingEvery) {
        status = 'idle';
      }
    }
    if (status == null) return;
    _lastUploadPos = pos;
    _lastUploadAt = now;
    unawaited(_send(pos.latitude, pos.longitude, pos.accuracy, status));
  }

  Future<void> _watchdog() async {
    final now = DateTime.now();
    final since = now.difference(_lastFixAt);
    if (since >= _silenceLimit) {
      debugPrint('GPS task silent for ${since.inSeconds}s — re-attaching stream');
      _lastFixAt = now;
      await _subscribe();
      final pos = _lastPosition;
      final lastAt = _lastUploadAt;
      if (pos != null && (lastAt == null || now.difference(lastAt) >= _idlePingEvery)) {
        _lastUploadAt = now;
        await _send(pos.latitude, pos.longitude, pos.accuracy, 'idle');
      }
    }
    await _flushQueue();
  }

  Map<String, dynamic> _ping(double lat, double lng, double accuracy, String status) => {
        'latitude': lat,
        'longitude': lng,
        'accuracy': accuracy,
        'status': status,
        'timestamp': DateTime.now().toUtc().toIso8601String(),
      };

  Future<void> _send(double lat, double lng, double accuracy, String status) async {
    final ping = _ping(lat, lng, accuracy, status);
    try {
      final token = await SecureStorage.getToken();
      if (token == null) {
        // Logged out / session gone — nothing to track for.
        await FlutterForegroundTask.stopService();
        return;
      }
      final res = await _http.post('/api/v1/gps/ping',
          data: ping, options: Options(headers: {'Authorization': 'Bearer $token'}));
      if (res.statusCode == 401) {
        await FlutterForegroundTask.stopService(); // session expired — the app asks for login next time
        return;
      }
      if (res.statusCode != null && res.statusCode! >= 400) {
        await _enqueue(ping);
        return;
      }
      await _flushQueue();
    } catch (_) {
      await _enqueue(ping); // no connection
    }
  }

  Future<void> _enqueue(Map<String, dynamic> ping) async {
    final q = _queue;
    if (q == null) return;
    // Cap the backlog (a day or so of pings) so a long outage can't grow it forever.
    if (q.length >= 5000) await q.deleteAt(0);
    await q.add(ping);
  }

  Future<void> _flushQueue() async {
    final q = _queue;
    if (q == null || q.isEmpty || _syncing) return;
    _syncing = true;
    try {
      final token = await SecureStorage.getToken();
      if (token == null) return;
      final keys = q.keys.toList();
      final pings = keys.map((k) => Map<String, dynamic>.from(q.get(k) as Map)).toList();
      // Batches of 200 so one request never gets huge.
      for (var i = 0; i < pings.length; i += 200) {
        final slice = pings.sublist(i, i + 200 > pings.length ? pings.length : i + 200);
        final res = await _http.post('/api/v1/gps/batch-ping',
            data: {'pings': slice}, options: Options(headers: {'Authorization': 'Bearer $token'}));
        if (res.data is Map && res.data['success'] == true) {
          await q.deleteAll(keys.sublist(i, i + slice.length));
        } else {
          break;
        }
      }
    } catch (_) {
      // still offline — try again on the next watchdog tick
    } finally {
      _syncing = false;
    }
  }
}
