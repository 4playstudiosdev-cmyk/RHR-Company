import 'dart:async';
import 'dart:io' show Platform;
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../core/location/location_service.dart';
import '../core/network/dio_client.dart';
import '../core/storage/secure_storage.dart';
import '../widgets/location_disclosure_dialog.dart';

/// Keeps sending GPS pings for as long as tracking is on — including while
/// the screen is off, the app is minimized, or another app is in front —
/// until something explicitly calls [stopTracking] (logout, or a session
/// going away).
///
/// How it stays alive:
///  * Location comes from geolocator's position stream running as a real
///    Android foreground service (permanent notification, required by
///    Android), holding a CPU wake lock + Wi-Fi lock so the phone doesn't
///    fall asleep between fixes with the screen off.
///  * A watchdog notices when the stream has gone quiet (the OS or a
///    battery manager killed it, or the phone is just standing still),
///    re-attaches it, and sends a heartbeat ping so the admin map shows the
///    person is still online at their last position.
///  * [ensureTracking] is called whenever the app comes back to the
///    foreground — before, a stream that had died silently was never
///    revived because "already tracking" short-circuited every restart.
///  * 5s / 1m keeps the admin map (polls every 10s — see GPS.js's
///    REFRESH_MS) feeling live without pinging pointlessly when stationary.
///
/// Some OEM Android skins (TECNO HiOS, Xiaomi, Oppo...) still kill
/// foreground services unless the user exempts the app from battery
/// optimisation / allows auto-start — see BackgroundTrackingHelper, which
/// walks the user through it.
class GPSService {
  static final GPSService _instance = GPSService._internal();
  factory GPSService() => _instance;
  GPSService._internal();

  static const String _boxName = 'gps_offline';
  static const int _intervalMs = 5000;
  static const double _distanceFilterMeters = 1;

  // How long without a fix before the stream is considered dead and
  // re-attached; and how often that's checked.
  static const Duration _silenceLimit = Duration(seconds: 90);
  static const Duration _watchdogEvery = Duration(seconds: 30);

  StreamSubscription<Position>? _positionSub;
  Timer? _watchdog;
  DateTime? _lastFixAt;
  DateTime? _lastPingAt;
  Position? _lastPosition;
  Box? _offlineBox;
  bool _isTracking = false;

  bool get isTracking => _isTracking;
  int get pendingOfflineCount => _offlineBox?.length ?? 0;
  // Human-readable interval for the GPS Tracking screen to display,
  // instead of a hardcoded string that drifts out of sync with the real
  // value (as "Pinging every 2 minutes"/"2 min" did after this moved to 5s).
  static String get intervalLabel => '${(_intervalMs / 1000).round()}s';

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

    _isTracking = true;
    _lastFixAt = DateTime.now();
    await _subscribe();
    _watchdog?.cancel();
    _watchdog = Timer.periodic(_watchdogEvery, (_) => unawaited(_checkAlive()));
    return true;
  }

  LocationSettings _locationSettings() {
    if (Platform.isAndroid) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: _distanceFilterMeters.round(),
        intervalDuration: const Duration(milliseconds: _intervalMs),
        // The foreground service that keeps this alive with the screen off.
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'RHR Company',
          notificationText: 'Your location is being shared while on duty',
          notificationChannelName: 'Location Tracking',
          enableWakeLock: true,
          enableWifiLock: true,
          setOngoing: true,
        ),
      );
    }
    return LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: _distanceFilterMeters.round(),
    );
  }

  /// (Re)attaches the position stream. Safe to call any time.
  Future<void> _subscribe() async {
    await _positionSub?.cancel();
    _positionSub = null;
    try {
      _positionSub = Geolocator.getPositionStream(locationSettings: _locationSettings()).listen(
        (pos) {
          _lastFixAt = DateTime.now();
          _lastPosition = pos;
          unawaited(_handleLocation(pos.latitude, pos.longitude, pos.accuracy, 'moving'));
        },
        onError: (e) => debugPrint('GPS stream error: $e'), // the watchdog re-attaches it
        cancelOnError: false,
      );
    } catch (e) {
      debugPrint('GPS subscribe failed: $e');
    }
  }

  /// Runs every 30 s while tracking: if no fix has arrived for 90 s, the
  /// stream is re-attached and a heartbeat ping goes out — the last known
  /// (or a fresh) position marked 'idle' — so a parked or stalled phone
  /// still shows as online instead of freezing on the map.
  Future<void> _checkAlive() async {
    if (!_isTracking) return;
    if (!await SecureStorage.isLoggedIn()) {
      await stopTracking(sync: false);
      return;
    }
    final since = DateTime.now().difference(_lastFixAt ?? DateTime.now());
    if (since < _silenceLimit) return;

    debugPrint('GPS silent for ${since.inSeconds}s — re-attaching stream');
    _lastFixAt = DateTime.now(); // don't re-attach again for another 90 s
    await _subscribe();

    final lastPing = _lastPingAt;
    if (lastPing != null && DateTime.now().difference(lastPing) < const Duration(seconds: 60)) return;
    try {
      Position? pos;
      try {
        pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            timeLimit: Duration(seconds: 15),
          ),
        );
      } catch (_) {
        pos = await Geolocator.getLastKnownPosition() ?? _lastPosition;
      }
      if (pos != null) {
        _lastPosition = pos;
        await _handleLocation(pos.latitude, pos.longitude, pos.accuracy, 'idle');
      }
    } catch (e) {
      debugPrint('GPS heartbeat failed: $e');
    }
  }

  /// Call when the app returns to the foreground (and at startup): starts
  /// tracking if it isn't running, and revives a stream that died while
  /// the app was in the background — which a plain [startTracking] never
  /// did, because it returns early whenever tracking is "already on".
  Future<void> ensureTracking() async {
    try {
      final token = await SecureStorage.getToken();
      final role = await SecureStorage.getRole();
      if (token == null || (role != 'salesman' && role != 'driver' && role != 'delivery')) return;

      if (!_isTracking) {
        await startTracking();
        return;
      }
      final since = DateTime.now().difference(_lastFixAt ?? DateTime(2000));
      if (_positionSub == null || since > const Duration(seconds: 60)) {
        debugPrint('GPS resumed with a quiet stream (${since.inSeconds}s) — re-attaching');
        _lastFixAt = DateTime.now();
        await _subscribe();
      }
      unawaited(_syncOfflinePoints());
    } catch (e) {
      debugPrint('ensureTracking failed: $e'); // never break the app over tracking
    }
  }

  /// [sync] = false skips uploading queued offline points. The 401 handler in
  /// dio_client.dart must use that: uploading needs a valid session, and the
  /// upload itself returns 401 again, which called stopTracking() again ...
  /// an endless request loop that starved the UI and froze the app on its
  /// loading screen whenever a stale (expired) session was saved.
  Future<void> stopTracking({bool sync = true}) async {
    _watchdog?.cancel();
    _watchdog = null;
    await _positionSub?.cancel(); // also stops geolocator's foreground service
    _positionSub = null;
    _isTracking = false;
    if (sync) await _syncOfflinePoints();
  }

  Future<void> _handleLocation(double? latitude, double? longitude, double? accuracy, String status) async {
    // Stop pinging the moment the session goes away instead of quietly
    // uploading points with a stale/cleared token.
    if (!await SecureStorage.isLoggedIn()) {
      await stopTracking(sync: false); // no session — nothing can upload
      return;
    }
    if (latitude == null || longitude == null) return;
    _lastPingAt = DateTime.now();
    final ping = {
      'latitude': latitude,
      'longitude': longitude,
      'accuracy': accuracy,
      'status': status,
      'timestamp': DateTime.now().toUtc().toIso8601String(),
    };

    try {
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
      debugPrint('GPS send error: $e');
    }
  }

  Future<void> _saveOffline(Map<String, dynamic> ping) async {
    await _offlineBox?.add(ping);
    debugPrint('GPS saved offline. Pending: ${_offlineBox?.length}');
  }

  bool _isSyncing = false;

  Future<void> _syncOfflinePoints() async {
    final box = _offlineBox;
    if (box == null || box.isEmpty) return;
    // Never run two uploads at once, and never re-enter from inside one.
    if (_isSyncing) return;
    _isSyncing = true;

    final keys = box.keys.toList();
    final pings = keys
        .map((key) => box.get(key))
        .where((raw) => raw != null)
        .map((raw) => Map<String, dynamic>.from(raw!))
        .toList();
    if (pings.isEmpty) {
      _isSyncing = false;
      return;
    }

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
    } finally {
      _isSyncing = false;
    }
  }
}
