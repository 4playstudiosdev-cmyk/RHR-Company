import 'package:hive_flutter/hive_flutter.dart';

class HiveService {
  static const String _ordersBox    = 'offline_orders';
  static const String _customersBox = 'cached_customers';
  static const String _productsBox  = 'cached_products';
  static const String _paymentsBox  = 'pending_payments';
  static const String _newCustBox   = 'pending_customers';

  static Future<void> init() async {
    await Hive.initFlutter();
    await Hive.openBox<Map>(_ordersBox);
    await Hive.openBox<Map>(_customersBox);
    await Hive.openBox<Map>(_productsBox);
    await Hive.openBox<Map>(_paymentsBox);
    await Hive.openBox<Map>(_newCustBox);
  }

  // ── Offline orders ───────────────────────────────────────────────────────
  static Future<void> saveOfflineOrder(Map<String, dynamic> order) async {
    final key = 'order_${DateTime.now().millisecondsSinceEpoch}';
    await Hive.box<Map>(_ordersBox).put(key, order);
  }

  static List<Map<String, dynamic>> getOfflineOrders() =>
      Hive.box<Map>(_ordersBox).values.map((e) => Map<String, dynamic>.from(e)).toList();

  static List<String> getOfflineOrderKeys() =>
      Hive.box<Map>(_ordersBox).keys.map((k) => k.toString()).toList();

  static int getOfflineOrderCount() => Hive.box<Map>(_ordersBox).length;

  static Future<void> clearOfflineOrder(String key) async =>
      Hive.box<Map>(_ordersBox).delete(key);

  static Future<void> clearAll() async => Hive.box<Map>(_ordersBox).clear();

  // ── Customer cache ───────────────────────────────────────────────────────
  static Future<void> cacheCustomers(List<Map<String, dynamic>> customers) async {
    final box = Hive.box<Map>(_customersBox);
    await box.clear();
    for (final c in customers) {
      await box.put(c['id'] as String, c);
    }
  }

  static List<Map<String, dynamic>> getCachedCustomers() =>
      Hive.box<Map>(_customersBox).values
          .map((e) => Map<String, dynamic>.from(e)).toList();

  static bool hasCustomerCache() => Hive.box<Map>(_customersBox).isNotEmpty;

  // ── Product cache ────────────────────────────────────────────────────────
  static Future<void> cacheProducts(List<Map<String, dynamic>> products) async {
    final box = Hive.box<Map>(_productsBox);
    await box.clear();
    for (final p in products) {
      await box.put(p['id'] as String, p);
    }
  }

  static List<Map<String, dynamic>> getCachedProducts() =>
      Hive.box<Map>(_productsBox).values
          .map((e) => Map<String, dynamic>.from(e)).toList();

  static bool hasProductCache() => Hive.box<Map>(_productsBox).isNotEmpty;

  // ── Pending payments ─────────────────────────────────────────────────────
  static Future<void> queuePayment(Map<String, dynamic> payment) async {
    final key = 'pay_${DateTime.now().millisecondsSinceEpoch}';
    await Hive.box<Map>(_paymentsBox).put(key, payment);
  }

  static List<Map<String, dynamic>> getPendingPayments() =>
      Hive.box<Map>(_paymentsBox).values
          .map((e) => Map<String, dynamic>.from(e)).toList();

  static List<String> getPendingPaymentKeys() =>
      Hive.box<Map>(_paymentsBox).keys.map((k) => k.toString()).toList();

  static int getPendingPaymentCount() => Hive.box<Map>(_paymentsBox).length;

  static Future<void> clearPendingPayment(String key) async =>
      Hive.box<Map>(_paymentsBox).delete(key);

  // ── Pending new customers ────────────────────────────────────────────────
  static Future<void> queueNewCustomer(Map<String, dynamic> customer) async {
    final key = 'cust_${DateTime.now().millisecondsSinceEpoch}';
    await Hive.box<Map>(_newCustBox).put(key, customer);
  }

  static List<Map<String, dynamic>> getPendingCustomers() =>
      Hive.box<Map>(_newCustBox).values
          .map((e) => Map<String, dynamic>.from(e)).toList();

  static List<String> getPendingCustomerKeys() =>
      Hive.box<Map>(_newCustBox).keys.map((k) => k.toString()).toList();

  static int getPendingCustomerCount() => Hive.box<Map>(_newCustBox).length;

  static Future<void> clearPendingCustomer(String key) async =>
      Hive.box<Map>(_newCustBox).delete(key);

  // ── Totals ───────────────────────────────────────────────────────────────
  static int getTotalPendingCount() =>
      getOfflineOrderCount() + getPendingPaymentCount() + getPendingCustomerCount();
}
