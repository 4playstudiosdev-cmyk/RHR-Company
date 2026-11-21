// What an order costs — same rule as the backend (syncOrderTotal) and the
// admin panel's invoice / order preview:
//   subtotal   = sum of the item lines (qty × rate)
//   conveyance = the conveyance the admin added on the invoice
//   sales tax  = 18% of the subtotal when the invoice was made "with tax"
//   total      = subtotal + conveyance + sales tax
class OrderCharges {
  final num subtotal;
  final num conveyance;
  final num tax;
  final num total;
  const OrderCharges({required this.subtotal, required this.conveyance, required this.tax, required this.total});

  static const taxRate = 0.18;

  static num _n(dynamic v) => v is num ? v : (num.tryParse('${v ?? ''}') ?? 0);
  static num _r2(num v) => (v * 100).round() / 100;

  /// Rate (unit price) of one order item.
  static num rateOf(Map item) => _n(item['unit_price'] ?? item['price']);

  /// Line amount of one order item (its saved subtotal, else qty × rate).
  static num lineAmount(Map item) {
    final saved = _n(item['subtotal']);
    if (saved > 0) return saved;
    return _n(item['quantity'] ?? item['qty'] ?? 1) * rateOf(item);
  }

  factory OrderCharges.of(Map? order) {
    final items = (order?['order_items'] as List?) ?? const [];
    final conveyance = _r2(_n(order?['invoice_conveyance']));
    final itemsSum = _r2(items.fold<num>(0, (s, it) => s + (it is Map ? lineAmount(it) : 0)));
    final subtotal = itemsSum > 0
        ? itemsSum
        : _r2((_n(order?['total_amount'] ?? order?['total']) - conveyance).clamp(0, double.infinity));
    final tax = order?['invoice_with_tax'] == true ? _r2(subtotal * taxRate) : 0;
    return OrderCharges(subtotal: subtotal, conveyance: conveyance, tax: tax, total: _r2(subtotal + conveyance + tax));
  }
}

/// "PKR 282,810" — thousands separators, decimals only when there are any.
String pkr(num value) {
  final neg = value < 0;
  final v = value.abs();
  final whole = v.truncate();
  final frac = ((v - whole) * 100).round();
  final digits = whole.toString();
  final buf = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buf.write(',');
    buf.write(digits[i]);
  }
  final dec = frac > 0 ? '.${frac.toString().padLeft(2, '0')}' : '';
  return 'PKR ${neg ? '-' : ''}$buf$dec';
}
