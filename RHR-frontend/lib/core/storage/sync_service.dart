import '../network/dio_client.dart';
import '../constants/api_endpoints.dart';
import 'hive_service.dart';

class SyncService {
  static bool _isSyncing = false;
  static bool get isSyncing => _isSyncing;

  static Future<void> syncAll() async {
    if (_isSyncing) return;
    _isSyncing = true;
    try {
      await syncOfflineOrders();
      await _syncPendingPayments();
      await _syncPendingCustomers();
    } finally {
      _isSyncing = false;
    }
  }

  static Future<Map<String, dynamic>> syncOfflineOrders() async {
    int synced = 0, failed = 0;
    final orders = HiveService.getOfflineOrders();
    final keys   = HiveService.getOfflineOrderKeys();
    for (int i = 0; i < orders.length; i++) {
      try {
        final res = await DioClient.instance.post(ApiEndpoints.orders, data: orders[i]);
        if (res.data['success'] == true) {
          await HiveService.clearOfflineOrder(keys[i]);
          synced++;
        } else {
          failed++;
        }
      } catch (e) {
        failed++;
      }
    }
    return {'synced': synced, 'failed': failed};
  }

  static Future<void> _syncPendingPayments() async {
    final payments = HiveService.getPendingPayments();
    final keys     = HiveService.getPendingPaymentKeys();
    for (int i = 0; i < payments.length; i++) {
      try {
        final p = Map<String, dynamic>.from(payments[i]);
        // Upload photo if stored as base64
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
            }
          } catch (_) {}
          p.remove('photo_base64');
        }
        final method   = p.remove('_method') as String? ?? 'Cash';
        final endpoint = _endpointForMethod(method);
        final res = await DioClient.instance.post(endpoint, data: p);
        if (res.data['success'] == true) {
          await HiveService.clearPendingPayment(keys[i]);
        }
      } catch (_) {}
    }
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
    for (int i = 0; i < customers.length; i++) {
      try {
        final c = Map<String, dynamic>.from(customers[i]);
        // Upload shop image if stored as base64
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
          } catch (_) {}
          c.remove('shop_image_base64');
        }
        final res = await DioClient.instance.post(ApiEndpoints.customers, data: c);
        if (res.data['success'] == true) {
          await HiveService.clearPendingCustomer(keys[i]);
        }
      } catch (_) {}
    }
  }
}
