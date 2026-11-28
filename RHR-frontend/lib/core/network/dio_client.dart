import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../constants/api_endpoints.dart';
import '../storage/secure_storage.dart';
import '../../services/gps_service.dart';
import '../../shared/router/app_router.dart';
import 'api_cache.dart';
import 'network_status.dart';

class DioClient {
  static Dio? _instance;

  static Dio get instance {
    _instance ??= _createDio();
    return _instance!;
  }

  /// Requests that must always really go out (login, OTP...), even while we
  /// think we are offline — they are how the user gets back in.
  static bool _alwaysTry(RequestOptions o) => o.path.contains('/auth/') || o.path.endsWith('/health');

  static Future<String> _cacheUser() async => (await SecureStorage.getUserId()) ?? 'anon';

  static Dio _createDio() {
    final dio = Dio(BaseOptions(
      baseUrl: ApiEndpoints.baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json'},
      validateStatus: (status) => status != null && status < 500,
    ));

    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await SecureStorage.getToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        // A saved-offline item carries its own id; sent as a header so the
        // server can ignore a second copy (e.g. the first try timed out but arrived).
        final body = options.data;
        if (body is Map && body.containsKey('_client_ref')) {
          final copy = Map<String, dynamic>.from(body);
          options.headers['X-Client-Ref'] = copy.remove('_client_ref').toString();
          options.data = copy;
        }

        // Photo uploads on a slow connection need longer than the normal 15 s
        // (the server also resizes the photo before storing it).
        if (options.path.endsWith('/storage/upload')) {
          options.sendTimeout = const Duration(seconds: 90);
          options.receiveTimeout = const Duration(seconds: 60);
        }

        // Known offline: answer straight from the phone instead of waiting
        // 15 s for a request that cannot get through.
        if (!NetworkStatus.isOnline && !_alwaysTry(options)) {
          if (options.method == 'GET') {
            final cached = ApiCache.read(await _cacheUser(), options);
            if (cached != null) {
              debugPrint('CACHE: ${options.path}');
              return handler.resolve(cached);
            }
            // Nothing saved — try the network, but don't hang for long.
            options.connectTimeout = const Duration(seconds: 5);
          } else {
            // Writes fail at once, so the screen saves them offline right away.
            return handler.reject(DioException(
              requestOptions: options,
              type: DioExceptionType.connectionError,
              error: 'offline',
              message: 'No internet connection',
            ));
          }
        }
        debugPrint('REQUEST: ${options.method} ${options.path}');
        return handler.next(options);
      },
      onResponse: (response, handler) async {
        debugPrint('RESPONSE: ${response.statusCode} ${response.requestOptions.path}');
        NetworkStatus.markOnline(); // the server answered
        // validateStatus below treats 401 as a normal (non-thrown) response,
        // so this — not onError — is where an expired/invalid session
        // actually needs to be caught and force a fresh login.
        if (response.statusCode == 401) {
          // sync: false — the session is already invalid, so uploading
          // queued GPS points would just 401 again and re-trigger this.
          await GPSService().stopTracking(sync: false);
          await SecureStorage.clearAll();
          await ApiCache.clear();
          if (appRouter.state.matchedLocation != '/login') {
            appRouter.go('/login');
          }
        } else if (response.requestOptions.method == 'GET' &&
            response.statusCode == 200 &&
            response.extra['fromCache'] != true) {
          // Keep the latest good answer for offline use.
          await ApiCache.save(await _cacheUser(), response.requestOptions, response.data);
        }
        return handler.next(response);
      },
      onError: (error, handler) async {
        debugPrint('ERROR: ${error.response?.statusCode} ${error.message}');
        if (error.response?.statusCode == 401) {
          await GPSService().stopTracking(sync: false);
          await SecureStorage.clearToken();
        }
        if (NetworkStatus.isNetworkError(error) && !_alwaysTry(error.requestOptions)) {
          NetworkStatus.markOffline();
          if (error.requestOptions.method == 'GET') {
            final cached = ApiCache.read(await _cacheUser(), error.requestOptions);
            if (cached != null) {
              debugPrint('CACHE (after failure): ${error.requestOptions.path}');
              return handler.resolve(cached);
            }
          }
        }
        return handler.next(error);
      },
    ));
    return dio;
  }
}
