/// Order quantity rule — the same for every product, customer and role
/// (customer app, salesman / driver app, admin desktop). Mirrors the backend's
/// src/utils/orderQtyRules.js — keep both (and the desktop's
/// src/utils/orderQtyRules.js) in sync.
///
///  * No per-product / per-category minimum — any quantity of any item.
///  * The TOTAL quantity of the whole order (all items together) must be at
///    least [kMinTotalQty] (1): there is no real minimum, one bag is a valid order.
///  * The − / + buttons step by [kQtyStep]; the quantity can also be typed.
const int kMinTotalQty = 1; // no minimum — even a single bag is a valid order
const int kQtyStep = 10;

class OrderQtyRule {
  final int min;
  final int step;
  const OrderQtyRule(this.min, this.step);
}

const _rule = OrderQtyRule(1, kQtyStep);

// Kept as functions (not constants) so existing call sites don't change; the
// name / category no longer matter.
OrderQtyRule qtyRuleFor({required String name, String category = ''}) => _rule;

OrderQtyRule qtyRuleForProduct(Map<String, dynamic> product) => _rule;

/// "Add N more to place this order" text, or null when the total is enough.
String? minTotalQtyHint(int totalQty) => totalQty >= kMinTotalQty
    ? null
    : 'Add at least one item.';
