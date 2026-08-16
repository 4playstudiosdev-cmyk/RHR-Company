import '../network/dio_client.dart';
import '../constants/api_endpoints.dart';
import 'hive_service.dart';

class SyncService {
  static bool _isSyncing = false;
  static bool get isSyncing => _isSyncing;

  static Future<Map<String, dynamic>> syncOfflineOrders() async {
    if (_isSyncing) return {'synced': 0, 'failed': 0};
    _isSyncing = true;

    int synced = 0, failed = 0;
    final orders = HiveService.getOfflineOrders();
    final keys = HiveService.getOfflineOrderKeys();

    for (int i = 0; i < orders.length; i++) {
      try {
        final res = await DioClient.instance.post(
            ApiEndpoints.orders, data: orders[i]);
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

    _isSyncing = false;
    return {'synced': synced, 'failed': failed};
  }
}
