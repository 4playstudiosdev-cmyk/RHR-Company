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
const _maproCement1kg = OrderQtyRule(25, 25);
const _maproCement5kg = OrderQtyRule(5, 5);
const _normal = OrderQtyRule(1, 1);

OrderQtyRule qtyRuleFor({required String name, String category = ''}) {
  final n = name.toLowerCase();
  final c = category.toLowerCase();
  if (c.contains('tile bond')) return _tileBond;
  if (c.contains('grout')) return _grout;
  // Mapro cement comes in a 1KG pack (default, no suffix) and a 5KG
  // pack — same wholesale-case logic as everything else, just a
  // different case size per weight, so each needs its own floor/step.
  if (n.contains('mapro')) return n.contains('5kg') ? _maproCement5kg : _maproCement1kg;
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
