import 'package:flutter/foundation.dart';

class CartStore extends ChangeNotifier {
  CartStore._();
  static final CartStore instance = CartStore._();

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
    int qty = 1,
  }) {
    final idx = _items.indexWhere((i) => i['id'] == id);
    if (idx >= 0) {
      _items[idx]['qty'] = (_items[idx]['qty'] as int) + qty;
    } else {
      _items.add({'id': id, 'name': name, 'price': price, 'unit': unit, 'qty': qty});
    }
    notifyListeners();
  }

  void updateQty(String id, int qty) {
    final idx = _items.indexWhere((i) => i['id'] == id);
    if (idx == -1) return;
    if (qty <= 0) {
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
