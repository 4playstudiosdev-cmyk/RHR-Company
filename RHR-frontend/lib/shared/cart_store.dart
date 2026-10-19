import 'package:flutter/foundation.dart';
import 'order_qty_rules.dart';

class CartStore extends ChangeNotifier {
  CartStore._();
  static final CartStore instance = CartStore._();

  final List<Map<String, dynamic>> _items = [];

  List<Map<String, dynamic>> get items => List.unmodifiable(_items);

  num get total =>
      _items.fold<num>(0, (sum, i) => sum + (i['price'] as num) * (i['qty'] as int));

  int get itemCount => _items.fold(0, (sum, i) => sum + (i['qty'] as int));

  // Every item moves in steps of 10 and its quantity can be typed; the
  // order as a whole needs at least 50 items. See order_qty_rules.dart.
  int minQtyFor(String id) {
    final idx = _items.indexWhere((i) => i['id'] == id);
    return idx == -1 ? 1 : (_items[idx]['minQty'] as int? ?? 1);
  }

  int stepFor(String id) {
    final idx = _items.indexWhere((i) => i['id'] == id);
    return idx == -1 ? 1 : (_items[idx]['qtyStep'] as int? ?? 1);
  }

  void add({
    required String id,
    required String name,
    required num price,
    String unit = '',
    String category = '',
    int? qty,
  }) {
    final rule = qtyRuleFor(name: name, category: category);
    final addQty = qty ?? rule.step;
    final idx = _items.indexWhere((i) => i['id'] == id);
    if (idx >= 0) {
      _items[idx]['qty'] = (_items[idx]['qty'] as int) + addQty;
    } else {
      _items.add({
        'id': id,
        'name': name,
        'price': price,
        'unit': unit,
        'qty': addQty < rule.min ? rule.min : addQty,
        'minQty': rule.min,
        'qtyStep': rule.step,
      });
    }
    notifyListeners();
  }

  void updateQty(String id, int qty) {
    final idx = _items.indexWhere((i) => i['id'] == id);
    if (idx == -1) return;
    if (qty < 1) {
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
