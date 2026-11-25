import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../network/dio_client.dart';
import '../network/network_status.dart';
import '../constants/api_endpoints.dart';
import 'hive_service.dart';
import 'secure_storage.dart';

/// Sends everything that was saved on the phone while offline.
///
/// Runs when the app opens, when it comes back to the foreground, as soon as
/// the server is reachable again, and every minute while something is waiting.
/// Each item carries its own id (`_client_ref`), so if a send times out after
/// the server already saved it, the next try is ignored instead of duplicated.
/// Order: new customers → orders → payments → visits.
class SyncService {
  static bool _isSyncing = false;
  static bool get isSyncing => _isSyncing;
  static final ValueNotifier<bool> syncing = ValueNotifier<bool>(false);
  static Timer? _timer;
  static String? _currentUser;

  /// Hook the automatic triggers up (called once from main).
  static void start() {
    NetworkStatus.addOnBackOnline(() => unawaited(syncAll()));
    _timer ??= Timer.periodic(const Duration(minutes: 1), (_) {
      if (HiveService.getTotalPendingCount() > 0) unawaited(syncAll());
    });
  }

  static Future<void> syncAll() async {
    if (_isSyncing || HiveService.getTotalPendingCount() == 0) return;
    _isSyncing = true;
    syncing.value = true;
    try {
      // Nothing gets through while offline — check first instead of failing each item.
      if (!NetworkStatus.isOnline && !await NetworkStatus.probe()) return;
      _currentUser = await SecureStorage.getUserId();
      if (_currentUser == null) return; // logged out
      await _syncPendingCustomers();
      await syncOfflineOrders();
      await _syncPendingPayments();
      await _syncPendingVisits();
    } finally {
      _isSyncing = false;
      syncing.value = false;
    }
  }

  /// Payload without the phone-only bookkeeping fields (`_client_ref` is kept —
  /// the network layer turns it into the X-Client-Ref header).
  static Map<String, dynamic> _clean(Map<String, dynamic> m) =>
      Map<String, dynamic>.from(m)..removeWhere((k, _) => k.startsWith('_') && k != '_client_ref');

  /// true = done (sent, or refused by the server and recorded) — remove it.
  /// false = try again later. Throws [_Offline] on network trouble.
  static Future<bool> _send(String what, String endpoint, Map<String, dynamic> body, [String? owner]) async {
    // Saved by another login on this phone — wait until that user is back.
    if (owner != null && owner != _currentUser) return false;
    try {
      final res = await DioClient.instance.post(endpoint, data: body);
      if (res.data is Map && res.data['success'] == true) return true;
      final status = res.statusCode ?? 0;
      // 401: session ended — keep it for after the next login. 409/429: try again later.
      if (status == 401 || status == 409 || status == 429) return false;
      final msg = (res.data is Map ? res.data['message'] : null)?.toString() ?? 'Refused by the server';
      await HiveService.recordSyncFailure(what, msg, body);
      return true;
    } on DioException catch (e) {
      if (NetworkStatus.isNetworkError(e)) throw _Offline();
      final msg = (e.response?.data is Map ? e.response?.data['message'] : null)?.toString() ?? e.message ?? 'Failed';
      await HiveService.recordSyncFailure(what, msg, body);
      return true;
    }
  }

  static Future<Map<String, dynamic>> syncOfflineOrders() async {
    int synced = 0, failed = 0;
    final orders = HiveService.getOfflineOrders();
    final keys   = HiveService.getOfflineOrderKeys();
    try {
      for (int i = 0; i < orders.length; i++) {
        if (await _send('Order', ApiEndpoints.orders, _clean(orders[i]), orders[i]['_user'] as String?)) {
          await HiveService.clearOfflineOrder(keys[i]);
          synced++;
        } else {
          failed++;
        }
      }
    } on _Offline {
      failed += orders.length - synced;
    }
    return {'synced': synced, 'failed': failed};
  }

  static Future<void> _syncPendingPayments() async {
    final payments = HiveService.getPendingPayments();
    final keys     = HiveService.getPendingPaymentKeys();
    try {
      for (int i = 0; i < payments.length; i++) {
        final p = Map<String, dynamic>.from(payments[i]);
        // Photo taken offline: upload it first; the url is kept on the item so a
        // later retry doesn't upload it again.
        if (p['photo_base64'] != null) {
          try {
            final uploadRes = await DioClient.instance.post(ApiEndpoints.storageUpload, data: {
              'bucket':     'payment-proofs',
              'fileName':   'payment_${DateTime.now().millisecondsSinceEpoch}.jpg',
              'fileBase64': p['photo_base64'],
              'mimeType':   'image/jpeg',
            });
            if (uploadRes.data['success'] == true) {
              p['photo_url'] = uploadRes.data['data']['url'];
              p.remove('photo_base64');
              await HiveService.updatePendingPayment(keys[i], p);
            }
          } on DioException catch (e) {
            if (NetworkStatus.isNetworkError(e)) throw _Offline();
          }
          p.remove('photo_base64'); // never send the raw photo with the payment
        }
        final endpoint = (p['_endpoint'] as String?) ?? _endpointForMethod(p['_method'] as String? ?? 'Cash');
        final label = 'Payment (${p['_method'] ?? 'Cash'}) PKR ${p['amount']}';
        if (await _send(label, endpoint, _clean(p), p['_user'] as String?)) {
          await HiveService.clearPendingPayment(keys[i]);
        }
      }
    } on _Offline {/* try again later */}
  }

  static String _endpointForMethod(String method) {
    switch (method) {
      case 'Bank Transfer':   return ApiEndpoints.recoveryBankTransferMe;
      case 'Cheque':          return ApiEndpoints.recoveryChequeMe;
      case 'Vendor Transfer': return ApiEndpoints.recoveryVendorTransferMe;
      default:                return ApiEndpoints.recoveryTransactionsMe;
    }
  }

  static Future<void> _syncPendingCustomers() async {
    final customers = HiveService.getPendingCustomers();
    final keys      = HiveService.getPendingCustomerKeys();
    try {
      for (int i = 0; i < customers.length; i++) {
        final c = Map<String, dynamic>.from(customers[i]);
        if (c['shop_image_base64'] != null) {
          try {
            final uploadRes = await DioClient.instance.post(ApiEndpoints.storageUpload, data: {
              'bucket':     'shop-photos',
              'fileName':   'shop_${DateTime.now().millisecondsSinceEpoch}.jpg',
              'fileBase64': c['shop_image_base64'],
              'mimeType':   'image/jpeg',
            });
            if (uploadRes.data['success'] == true) {
              c['shop_image_url'] = uploadRes.data['data']['url'];
            }
          } on DioException catch (e) {
            if (NetworkStatus.isNetworkError(e)) throw _Offline();
          }
          c.remove('shop_image_base64');
        }
        if (await _send('New customer ${c['shop_name'] ?? c['full_name'] ?? ''}', ApiEndpoints.customers, _clean(c), c['_user'] as String?)) {
          await HiveService.clearPendingCustomer(keys[i]);
        }
      }
    } on _Offline {/* try again later */}
  }

  static Future<void> _syncPendingVisits() async {
    final visits = HiveService.getPendingVisits();
    try {
      for (final e in visits.entries) {
        if (await _send('Visit', ApiEndpoints.visits, _clean(e.value), e.value['_user'] as String?)) {
          await HiveService.clearPendingVisit(e.key);
        }
      }
    } on _Offline {/* try again later */}
  }
}

class _Offline implements Exception {}
