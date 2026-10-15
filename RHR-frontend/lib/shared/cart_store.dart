import 'package:flutter/foundation.dart';

class CartStore extends ChangeNotifier {
  CartStore._();
  static final CartStore instance = CartStore._();

  // Wholesale-order rule: no cart line can sit between 1 and 49 — it's
  // either 0 (not in the cart) or at least 50, moving in steps of 10
  // after that (50, 60, 70, ...). Applies to every product regardless
  // of unit (bag, pcs, dozen, kg, bottle, pouch).
  static const int kMinQty = 50;
  static const int kQtyStep = 10;

  final List<Map<String, dynamic>> _items = [];

  List<Map<String, dynamic>> get items => List.unmodifiable(_items);

  num get total =>
      _items.fold<num>(0, (sum, i) => sum + (i['price'] as num) * (i['qty'] as int));

  int get itemCount => _items.fold(0, (sum, i) => sum + (i['qty'] as int));

  void add({
    required String id,
    required String name,
    required num price,
    String unit = '',
    int qty = kMinQty,
  }) {
    final idx = _items.indexWhere((i) => i['id'] == id);
    if (idx >= 0) {
      _items[idx]['qty'] = (_items[idx]['qty'] as int) + qty;
    } else {
      _items.add({'id': id, 'name': name, 'price': price, 'unit': unit, 'qty': qty < kMinQty ? kMinQty : qty});
    }
    notifyListeners();
  }

  void updateQty(String id, int qty) {
    final idx = _items.indexWhere((i) => i['id'] == id);
    if (idx == -1) return;
    if (qty < kMinQty) {
      _items.removeAt(idx);
    } else {
      _items[idx]['qty'] = qty;
    }
    notifyListeners();
  }

  void remove(String id) {
    _items.removeWhere((i) => i['id'] == id);
    notifyListeners();
  }

  void clear() {
    _items.clear();
    notifyListeners();
  }
}
