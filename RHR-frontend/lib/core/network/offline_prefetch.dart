import 'dart:async';

import 'package:flutter/foundation.dart';

import '../constants/api_endpoints.dart';
import '../storage/secure_storage.dart';
import 'dio_client.dart';
import 'network_status.dart';

/// While online, quietly loads the data of every screen so it is saved on the
/// phone (see ApiCache) before the internet drops — also screens the user has
/// not opened yet. Per-customer pages (ledger, details, prices) are loaded for
/// all of a salesman's customers, a few at a time, at most every 6 hours.
class OfflinePrefetch {
  OfflinePrefetch._();

  static bool _running = false;
  static DateTime? _lastRun;
  static DateTime? _lastPerCustomer;

  static Future<void> run({bool force = false}) async {
    if (_running || !NetworkStatus.isOnline) return;
    if (!force && _lastRun != null && DateTime.now().difference(_lastRun!) < const Duration(minutes: 10)) return;
    _running = true;
    _lastRun = DateTime.now();
    final sw = Stopwatch()..start();
    try {
      final role = await SecureStorage.getRole();
      final userId = await SecureStorage.getUserId();
      final dio = DioClient.instance;
      Future<void> get(String path, [Map<String, dynamic>? q]) =>
          dio.get(path, queryParameters: q).then((_) {}, onError: (_) {});

      final now = DateTime.now();
      final today = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';

      if (role == 'salesman') {
        await Future.wait([
          get(ApiEndpoints.customers),
          get(ApiEndpoints.products, {'limit': 200}),
          get(ApiEndpoints.categories),
          get(ApiEndpoints.orders),
          get(ApiEndpoints.recoveryTransactionsMe),
          get(ApiEndpoints.visits, {'from': today, 'to': today}),
          get(ApiEndpoints.salesmanMyProfile),
          get(ApiEndpoints.bankAccountsList),
          get(ApiEndpoints.suppliers),
          get(ApiEndpoints.recoveryMyCashInHand),
          get(ApiEndpoints.recoveryCashClosingMe),
          get(ApiEndpoints.recoveryBankTransfersMe),
          get(ApiEndpoints.recoveryChequesMe),
          get(ApiEndpoints.salesmenDirectory),
          get('/api/v1/notifications'),
        ]);
        await _perCustomer();
      } else if (role == 'driver') {
        await Future.wait([
          get(ApiEndpoints.orders),
          get(ApiEndpoints.driverMyProfile),
          get(ApiEndpoints.driverMyCashInHand),
          get(ApiEndpoints.driverCashClosingMe),
          get(ApiEndpoints.bankAccountsList),
          get(ApiEndpoints.salesmenDirectory),
          get('/api/v1/notifications'),
        ]);
      } else if (userId != null) {
        // customer
        await Future.wait([
          get(ApiEndpoints.orders),
          get(ApiEndpoints.orders, {'limit': 5}),
          get('${ApiEndpoints.ledger}$userId'),
          get(ApiEndpoints.myProfile),
          get(ApiEndpoints.products, {'page': 1, 'limit': 200}),
          get(ApiEndpoints.categories),
          get(ApiEndpoints.promoBanners),
          get(ApiEndpoints.payments),
          get(ApiEndpoints.bankAccountsList),
          get('/api/v1/customers/me/salesman'),
          get('/api/v1/notifications'),
        ]);
      }
      debugPrint('PREFETCH: done in ${sw.elapsedMilliseconds} ms');
    } catch (e) {
      debugPrint('PREFETCH failed: $e');
    } finally {
      _running = false;
    }
  }

  /// Ledger, details and prices of each of the salesman's customers.
  static Future<void> _perCustomer() async {
    if (_lastPerCustomer != null && DateTime.now().difference(_lastPerCustomer!) < const Duration(hours: 6)) return;
    final res = await DioClient.instance.get(ApiEndpoints.customers);
    final list = (res.data is Map && res.data['data'] is List) ? res.data['data'] as List : const [];
    final ids = list.map((c) => (c is Map ? c['id'] : null)?.toString()).whereType<String>().toList();
    const batch = 4;
    for (var i = 0; i < ids.length; i += batch) {
      if (!NetworkStatus.isOnline) return; // dropped — stop, try next time
      final part = ids.skip(i).take(batch);
      await Future.wait(part.expand((id) => [
            DioClient.instance.get('${ApiEndpoints.ledger}$id').then((_) {}, onError: (_) {}),
            DioClient.instance.get('${ApiEndpoints.customers}/$id').then((_) {}, onError: (_) {}),
            DioClient.instance.get('${ApiEndpoints.customers}/$id/pricing').then((_) {}, onError: (_) {}),
          ]));
    }
    _lastPerCustomer = DateTime.now();
    debugPrint('PREFETCH: ${ids.length} customers saved for offline');
  }
}
