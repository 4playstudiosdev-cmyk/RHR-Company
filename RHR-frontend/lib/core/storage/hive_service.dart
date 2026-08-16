import 'package:hive_flutter/hive_flutter.dart';

class HiveService {
  static const String _box = 'offline_orders';

  static Future<void> init() async {
    await Hive.initFlutter();
    await Hive.openBox<Map>(_box);
  }

  static Future<void> saveOfflineOrder(Map<String, dynamic> order) async {
    final key = 'order_${DateTime.now().millisecondsSinceEpoch}';
    await Hive.box<Map>(_box).put(key, order);
  }

  static List<Map<String, dynamic>> getOfflineOrders() {
    return Hive.box<Map>(_box).values
        .map((e) => Map<String, dynamic>.from(e)).toList();
  }

  static List<String> getOfflineOrderKeys() {
    return Hive.box<Map>(_box).keys.map((k) => k.toString()).toList();
  }

  static int getOfflineOrderCount() => Hive.box<Map>(_box).length;

  static Future<void> clearOfflineOrder(String key) async {
    await Hive.box<Map>(_box).delete(key);
  }

  static Future<void> clearAll() async {
    await Hive.box<Map>(_box).clear();
  }
}
