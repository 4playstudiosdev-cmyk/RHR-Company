import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'sync_service.dart';

class ConnectivityService {
  static StreamSubscription? _sub;
  static bool _wasOffline = false;

  static void startListening() {
    _sub = Connectivity().onConnectivityChanged.listen((results) {
      final isOnline = results.any((r) => r != ConnectivityResult.none);
      if (isOnline && _wasOffline) {
        // Back online — push anything that was queued while offline
        SyncService.syncAll();
      }
      _wasOffline = !isOnline;
    });
  }

  static Future<bool> isOnline() async {
    final results = await Connectivity().checkConnectivity();
    return results.any((r) => r != ConnectivityResult.none);
  }

  static void dispose() => _sub?.cancel();
}
