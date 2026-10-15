/// Per-product minimum order quantity + stepper increment, based on how
/// each product line is actually packaged/sold — not a single flat rule
/// for every product. Mirrors the backend's identical logic in
/// orders.service.js#qtyRuleFor, so a cart built here never gets
/// rejected server-side for a quantity the UI itself allowed.
class OrderQtyRule {
  final int min;
  final int step;
  const OrderQtyRule(this.min, this.step);
}

const _tileBond = OrderQtyRule(50, 10);
const _grout = OrderQtyRule(6, 6);
const _maproCement = OrderQtyRule(25, 25);
const _normal = OrderQtyRule(1, 1);

OrderQtyRule qtyRuleFor({required String name, String category = ''}) {
  final n = name.toLowerCase();
  final c = category.toLowerCase();
  if (c.contains('tile bond')) return _tileBond;
  if (c.contains('grout')) return _grout;
  if (n.contains('mapro')) return _maproCement;
  return _normal;
}

/// Convenience overload for a raw product map as returned by the API
/// (`{..., 'categories': {'name': '...'}}` or a flat `'category'` string).
OrderQtyRule qtyRuleForProduct(Map<String, dynamic> product) {
  final category = (product['categories'] is Map
          ? product['categories']['name']
          : product['category']) ??
      '';
  return qtyRuleFor(name: (product['name'] ?? '').toString(), category: category.toString());
}
