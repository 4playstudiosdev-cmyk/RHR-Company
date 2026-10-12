import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:location/location.dart' as loc;
import '../core/location/location_service.dart';
import '../core/network/dio_client.dart';
import '../core/storage/secure_storage.dart';
import '../widgets/location_disclosure_dialog.dart';

/// Keeps sending GPS pings for as long as tracking is on — including while
/// the app is minimized or swiped away from Recents, until something
/// explicitly calls [stopTracking] (logout, or a session going away). Runs
/// on a real Android foreground service (the `location` package's
/// background mode), which is why a permanent notification is required —
/// Android itself enforces that for any app accessing location in the
/// background, it can't be hidden. 5s / 1m keeps the admin map (which
/// polls every 10s — see GPS.js's REFRESH_MS) feeling live without
/// pinging pointlessly often when the phone hasn't actually moved.
///
/// Note for real-device testing: some OEM Android skins (the exact family
/// TECNO's HiOS is part of) kill foreground services anyway unless the
/// user disables battery optimization / enables autostart for this app —
/// that's an OS-level restriction outside what any app can override from
/// inside itself.
class GPSService {
  static final GPSService _instance = GPSService._internal();
  factory GPSService() => _instance;
  GPSService._internal();

  static const String _boxName = 'gps_offline';
  static const int _intervalMs = 5000;
  static const double _distanceFilterMeters = 1;

  final loc.Location _location = loc.Location();
  StreamSubscription<loc.LocationData>? _locationSub;
  Box? _offlineBox;
  bool _isTracking = false;

  bool get isTracking => _isTracking;
  int get pendingOfflineCount => _offlineBox?.length ?? 0;

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

    try {
      await _location.changeNotificationOptions(
        channelName: 'Location Tracking',
        title: 'RHR Company',
        subtitle: 'Your location is being shared while on duty',
        onTapBringToFront: true,
      );
      await _location.changeSettings(
        accuracy: loc.LocationAccuracy.high,
        interval: _intervalMs,
        distanceFilter: _distanceFilterMeters,
      );
      // Starts the actual Android foreground service — tracking survives
      // the app being minimized or swiped from Recents from this point on.
      final backgroundStarted = await _location.enableBackgroundMode(enable: true);
      if (!backgroundStarted) {
        debugPrint('GPS background mode could not be enabled — tracking only while app is open');
      }
    } catch (e) {
      debugPrint('GPS background mode setup failed: $e');
    }

    _isTracking = true;
    _locationSub = _location.onLocationChanged.listen(
      (data) => unawaited(_handleLocation(data)),
      onError: (e) => debugPrint('GPS stream error: $e'),
    );
    return true;
  }

  /// [sync] = false skips uploading queued offline points. The 401 handler in
  /// dio_client.dart must use that: uploading needs a valid session, and the
  /// upload itself returns 401 again, which called stopTracking() again ...
  /// an endless request loop that starved the UI and froze the app on its
  /// loading screen whenever a stale (expired) session was saved.
  Future<void> stopTracking({bool sync = true}) async {
    await _locationSub?.cancel();
    _locationSub = null;
    _isTracking = false;
    try {
      await _location.enableBackgroundMode(enable: false);
    } catch (e) {
      debugPrint('GPS background mode teardown failed: $e');
    }
    if (sync) await _syncOfflinePoints();
  }

  Future<void> _handleLocation(loc.LocationData data) async {
    // Stop pinging the moment the session goes away instead of quietly
    // uploading points with a stale/cleared token.
    if (!await SecureStorage.isLoggedIn()) {
      await stopTracking(sync: false); // no session — nothing can upload
      return;
    }
    final ping = {
      'latitude': data.latitude,
      'longitude': data.longitude,
      'accuracy': data.accuracy,
      'status': 'moving',
      'timestamp': DateTime.now().toIso8601String(),
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
