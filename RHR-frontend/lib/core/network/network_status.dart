import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../constants/api_endpoints.dart';

/// Is our server actually reachable right now?
///
/// Decided by real requests, not by the phone's Wi-Fi / data icon: a phone on
/// Wi-Fi without internet, or on a WhatsApp/social-only bundle, "has a
/// connection" but can't reach us. Any answer from the server marks us online;
/// a network failure marks us offline, after which the server is probed every
/// 15 s until it answers again.
class NetworkStatus {
  NetworkStatus._();

  static final ValueNotifier<bool> online = ValueNotifier<bool>(true);
  static bool get isOnline => online.value;

  /// Called once each time we come back online (wired to SyncService in main).
  static final List<VoidCallback> _onBackOnline = [];
  static void addOnBackOnline(VoidCallback cb) => _onBackOnline.add(cb);

  static Timer? _probeTimer;
  static bool _probing = false;

  static void markOnline() {
    if (online.value) return;
    online.value = true;
    _probeTimer?.cancel();
    _probeTimer = null;
    debugPrint('NETWORK: back online');
    for (final cb in List.of(_onBackOnline)) {
      try { cb(); } catch (_) {}
    }
  }

  static void markOffline() {
    if (online.value) {
      online.value = false;
      debugPrint('NETWORK: offline — using saved data');
    }
    _probeTimer ??= Timer.periodic(const Duration(seconds: 15), (_) => probe());
  }

  /// Quick check against the server's /health (5 s max). Updates [online].
  static Future<bool> probe() async {
    if (_probing) return online.value;
    _probing = true;
    try {
      final dio = Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 5),
        validateStatus: (s) => s != null && s < 500,
      ));
      final r = await dio.get('${ApiEndpoints.baseUrl}/health');
      if (r.statusCode != null && r.statusCode! < 500) {
        markOnline();
        return true;
      }
      markOffline();
      return false;
    } catch (_) {
      markOffline();
      return false;
    } finally {
      _probing = false;
    }
  }

  /// True when a request failed because the server could not be reached
  /// (no internet, DNS, timeout, server down) — not when it answered with an error.
  static bool isNetworkError(Object e) {
    if (e is! DioException) return e is SocketException || e is TimeoutException;
    if (e.response != null) {
      final s = e.response!.statusCode ?? 0;
      return s == 502 || s == 503 || s == 504; // gateway / server unreachable
    }
    switch (e.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return true;
      case DioExceptionType.unknown:
        return e.error is SocketException || e.error is HandshakeException || e.error is HttpException || e.error is TimeoutException;
      default:
        return false;
    }
  }
}
