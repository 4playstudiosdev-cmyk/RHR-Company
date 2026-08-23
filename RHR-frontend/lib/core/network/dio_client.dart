import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../constants/api_endpoints.dart';
import '../storage/secure_storage.dart';
import '../../services/gps_service.dart';
import '../../shared/router/app_router.dart';

class DioClient {
  static Dio? _instance;

  static Dio get instance {
    _instance ??= _createDio();
    return _instance!;
  }

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
        debugPrint('REQUEST: ${options.method} ${options.path}');
        return handler.next(options);
      },
      onResponse: (response, handler) async {
        debugPrint('RESPONSE: ${response.statusCode} ${response.requestOptions.path}');
        // validateStatus below treats 401 as a normal (non-thrown) response,
        // so this — not onError — is where an expired/invalid session
        // actually needs to be caught and force a fresh login.
        if (response.statusCode == 401) {
          await GPSService().stopTracking();
          await SecureStorage.clearAll();
          if (appRouter.state.matchedLocation != '/login') {
            appRouter.go('/login');
          }
        }
        return handler.next(response);
      },
      onError: (error, handler) async {
        debugPrint('ERROR: ${error.response?.statusCode} ${error.message}');
        if (error.response?.statusCode == 401) {
          await GPSService().stopTracking();
          await SecureStorage.clearToken();
        }
        return handler.next(error);
      },
    ));
    return dio;
  }
}
