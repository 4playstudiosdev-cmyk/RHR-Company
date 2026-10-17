// A customer is shown under their shop / business name (that's who invoices
// are made out to); the person's own name is secondary. Works on a customer
// map, or on an order/payment row's nested `users` / `customer` map.
String customerTitle(Map? c, {String fallback = 'Customer'}) {
  final shop = (c?['shop_name'] ?? '').toString().trim();
  if (shop.isNotEmpty) return shop;
  final name = (c?['full_name'] ?? c?['name'] ?? '').toString().trim();
  return name.isNotEmpty ? name : fallback;
}

// Searchable text covering both names.
String customerSearchText(Map? c) =>
    '${c?['shop_name'] ?? ''} ${c?['full_name'] ?? c?['name'] ?? ''}'.toLowerCase();
