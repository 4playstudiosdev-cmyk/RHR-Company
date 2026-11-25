import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../network/network_status.dart';

/// Watches the phone's network (Wi-Fi / mobile data on or off) and keeps
/// [NetworkStatus] up to date. Whether we are really online is decided by the
/// server answering (see NetworkStatus) — a phone on Wi-Fi without internet,
/// or on a social-only data bundle, shows a connection but can't reach us.
class ConnectivityService {
  static StreamSubscription? _sub;

  static void startListening() {
    _sub = Connectivity().onConnectivityChanged.listen((results) {
      final hasNetwork = results.any((r) => r != ConnectivityResult.none);
      if (!hasNetwork) {
        NetworkStatus.markOffline();
      } else {
        // Network came back (or changed) — check if the server is reachable;
        // when it is, NetworkStatus starts the sync of anything saved offline.
        unawaited(NetworkStatus.probe());
      }
    });
  }

  /// Real reachability of our server (not just "Wi-Fi/data is on").
  static Future<bool> isOnline() async {
    if (!NetworkStatus.isOnline) return false;
    final results = await Connectivity().checkConnectivity();
    if (!results.any((r) => r != ConnectivityResult.none)) {
      NetworkStatus.markOffline();
      return false;
    }
    return true;
  }

  static void dispose() => _sub?.cancel();
}
