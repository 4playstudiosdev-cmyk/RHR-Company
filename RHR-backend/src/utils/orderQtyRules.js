// Per-product minimum order quantity + stepper increment, based on how
// each product line is actually packaged/sold. Mirrors the frontend's
// identical logic in lib/shared/order_qty_rules.dart — keep both in sync.
const RULES = {
  tileBond: { min: 50, step: 10 },
  grout: { min: 6, step: 6 },
  maproCement: { min: 25, step: 25 },
  normal: { min: 1, step: 1 },
};

function qtyRuleFor(name = '', category = '') {
  const n = String(name).toLowerCase();
  const c = String(category).toLowerCase();
  if (c.includes('tile bond')) return RULES.tileBond;
  if (c.includes('grout')) return RULES.grout;
  if (n.includes('mapro')) return RULES.maproCement;
  return RULES.normal;
}

module.exports = { qtyRuleFor };
