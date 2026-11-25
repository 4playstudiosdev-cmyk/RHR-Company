import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'secure_storage.dart';

class HiveService {
  static const String _ordersBox         = 'offline_orders';
  static const String _customersBox      = 'cached_customers';
  static const String _productsBox       = 'cached_products';
  static const String _paymentsBox       = 'pending_payments';
  static const String _newCustBox        = 'pending_customers';
  static const String _bankAccountsBox   = 'cached_bank_accounts';
  static const String _customerPricesBox = 'cached_customer_prices';
  static const String _visitsBox         = 'pending_visits';
  static const String _failedBox         = 'sync_failed';

  /// How many items are saved on the phone waiting to be sent (drives the offline bar).
  static final ValueNotifier<int> pending = ValueNotifier<int>(0);

  /// Items the server refused when they were synced (shown to the salesman).
  static final ValueNotifier<int> failed = ValueNotifier<int>(0);

  static Future<void> init() async {
    await Hive.initFlutter();
    // Opened together, not one after another (faster app start).
    await Future.wait([
      for (final b in [_ordersBox, _customersBox, _productsBox, _paymentsBox, _newCustBox, _bankAccountsBox, _customerPricesBox, _visitsBox, _failedBox])
        Hive.openBox<Map>(b),
    ]);
    _refresh();
  }

  static void _refresh() {
    pending.value = getTotalPendingCount();
    failed.value = Hive.box<Map>(_failedBox).length;
  }

  /// Unique id for an item saved offline. Sent to the server with the item so a
  /// second copy (e.g. the first try timed out but did arrive) is ignored.
  static String newClientRef() =>
      '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 32).toRadixString(36)}';

  /// Adds the item's own id and who saved it (only ever sent under that login).
  static Future<Map<String, dynamic>> _withRef(Map<String, dynamic> m) async => {
        ...m,
        if (!m.containsKey('_client_ref')) '_client_ref': newClientRef(),
        if (!m.containsKey('_user')) '_user': await SecureStorage.getUserId(),
      };

  static String _key(String prefix) => '${prefix}_${DateTime.now().microsecondsSinceEpoch}';

  // ── Offline orders ───────────────────────────────────────────────────────
  static Future<void> saveOfflineOrder(Map<String, dynamic> order) async {
    await Hive.box<Map>(_ordersBox).put(_key('order'), {...await _withRef(order), '_saved_at': DateTime.now().toIso8601String()});
    _refresh();
  }

  static List<Map<String, dynamic>> getOfflineOrders() =>
      Hive.box<Map>(_ordersBox).values.map((e) => Map<String, dynamic>.from(e)).toList();

  static List<String> getOfflineOrderKeys() =>
      Hive.box<Map>(_ordersBox).keys.map((k) => k.toString()).toList();

  static int getOfflineOrderCount() => Hive.box<Map>(_ordersBox).length;

  static Future<void> clearOfflineOrder(String key) async {
    await Hive.box<Map>(_ordersBox).delete(key);
    _refresh();
  }

  static Future<void> clearAll() async {
    await Hive.box<Map>(_ordersBox).clear();
    _refresh();
  }

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
    for (int i = 0; i < products.length; i++) {
      await box.put(products[i]['id'] as String, {...products[i], '_sort_index': i});
    }
  }

  static List<Map<String, dynamic>> getCachedProducts() {
    final list = Hive.box<Map>(_productsBox).values
        .map((e) => Map<String, dynamic>.from(e)).toList();
    list.sort((a, b) => (a['_sort_index'] as int? ?? 0).compareTo(b['_sort_index'] as int? ?? 0));
    return list;
  }

  static bool hasProductCache() => Hive.box<Map>(_productsBox).isNotEmpty;

  // ── Pending payments ─────────────────────────────────────────────────────
  static Future<void> queuePayment(Map<String, dynamic> payment) async {
    await Hive.box<Map>(_paymentsBox).put(_key('pay'), {...await _withRef(payment), '_saved_at': DateTime.now().toIso8601String()});
    _refresh();
  }

  static List<Map<String, dynamic>> getPendingPayments() =>
      Hive.box<Map>(_paymentsBox).values
          .map((e) => Map<String, dynamic>.from(e)).toList();

  static List<String> getPendingPaymentKeys() =>
      Hive.box<Map>(_paymentsBox).keys.map((k) => k.toString()).toList();

  static int getPendingPaymentCount() => Hive.box<Map>(_paymentsBox).length;

  /// Rewrites a waiting payment (e.g. its photo got uploaded but the payment itself not yet).
  static Future<void> updatePendingPayment(String key, Map<String, dynamic> payment) async {
    if (Hive.box<Map>(_paymentsBox).containsKey(key)) await Hive.box<Map>(_paymentsBox).put(key, payment);
  }

  static Future<void> clearPendingPayment(String key) async {
    await Hive.box<Map>(_paymentsBox).delete(key);
    _refresh();
  }

  // ── Pending new customers ────────────────────────────────────────────────
  static Future<void> queueNewCustomer(Map<String, dynamic> customer) async {
    await Hive.box<Map>(_newCustBox).put(_key('cust'), {...await _withRef(customer), '_saved_at': DateTime.now().toIso8601String()});
    _refresh();
  }

  static List<Map<String, dynamic>> getPendingCustomers() =>
      Hive.box<Map>(_newCustBox).values
          .map((e) => Map<String, dynamic>.from(e)).toList();

  static List<String> getPendingCustomerKeys() =>
      Hive.box<Map>(_newCustBox).keys.map((k) => k.toString()).toList();

  static int getPendingCustomerCount() => Hive.box<Map>(_newCustBox).length;

  static Future<void> clearPendingCustomer(String key) async {
    await Hive.box<Map>(_newCustBox).delete(key);
    _refresh();
  }

  // ── Pending customer visits ──────────────────────────────────────────────
  static Future<void> queueVisit(Map<String, dynamic> visit) async {
    await Hive.box<Map>(_visitsBox).put(_key('visit'), await _withRef(visit));
    _refresh();
  }

  static Map<String, Map<String, dynamic>> getPendingVisits() => {
        for (final k in Hive.box<Map>(_visitsBox).keys) k.toString(): Map<String, dynamic>.from(Hive.box<Map>(_visitsBox).get(k)!),
      };

  static int getPendingVisitCount() => Hive.box<Map>(_visitsBox).length;

  static Future<void> clearPendingVisit(String key) async {
    await Hive.box<Map>(_visitsBox).delete(key);
    _refresh();
  }

  // ── Items the server refused during sync ─────────────────────────────────
  static Future<void> recordSyncFailure(String what, String message, Map<String, dynamic> payload) async {
    await Hive.box<Map>(_failedBox).put(_key('fail'), {
      'what': what,
      'message': message,
      'at': DateTime.now().toIso8601String(),
      'payload': payload..remove('photo_base64')..remove('shop_image_base64'),
    });
    _refresh();
  }

  static List<Map<String, dynamic>> getSyncFailures() =>
      Hive.box<Map>(_failedBox).values.map((e) => Map<String, dynamic>.from(e)).toList().reversed.toList();

  static Future<void> clearSyncFailures() async {
    await Hive.box<Map>(_failedBox).clear();
    _refresh();
  }

  // ── Bank accounts cache ──────────────────────────────────────────────────
  static Future<void> cacheBankAccounts(List<Map<String, dynamic>> accounts) async {
    final box = Hive.box<Map>(_bankAccountsBox);
    await box.clear();
    for (final a in accounts) {
      await box.put(a['id'] as String, a);
    }
  }

  static List<Map<String, dynamic>> getCachedBankAccounts() =>
      Hive.box<Map>(_bankAccountsBox).values
          .map((e) => Map<String, dynamic>.from(e)).toList();

  static bool hasBankAccountCache() => Hive.box<Map>(_bankAccountsBox).isNotEmpty;

  // ── Customer custom prices cache ─────────────────────────────────────────
  static Future<void> cacheCustomerPrices(String customerId, Map<String, dynamic> priceMap) async {
    await Hive.box<Map>(_customerPricesBox).put(customerId, priceMap);
  }

  static Map<String, dynamic>? getCachedCustomerPrices(String customerId) {
    final raw = Hive.box<Map>(_customerPricesBox).get(customerId);
    if (raw == null) return null;
    return Map<String, dynamic>.from(raw);
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  static int getTotalPendingCount() =>
      getOfflineOrderCount() + getPendingPaymentCount() + getPendingCustomerCount() + getPendingVisitCount();
}
