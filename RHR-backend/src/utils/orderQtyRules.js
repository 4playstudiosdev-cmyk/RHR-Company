// Per-product minimum order quantity + stepper increment, based on how
// each product line is actually packaged/sold. Mirrors the frontend's
// identical logic in lib/shared/order_qty_rules.dart — keep both in sync.
const RULES = {
  tileBond: { min: 50, step: 10 },
  grout: { min: 6, step: 6 },
  maproCement1kg: { min: 25, step: 25 },
  maproCement5kg: { min: 5, step: 5 },
  normal: { min: 1, step: 1 },
};

function qtyRuleFor(name = '', category = '') {
  const n = String(name).toLowerCase();
  const c = String(category).toLowerCase();
  if (c.includes('tile bond')) return RULES.tileBond;
  if (c.includes('grout')) return RULES.grout;
  // Mapro cement comes in a 1KG pack (default, no suffix) and a 5KG
  // pack — same wholesale-case logic as everything else, just a
  // different case size per weight, so each needs its own floor/step.
  if (n.includes('mapro')) return n.includes('5kg') ? RULES.maproCement5kg : RULES.maproCement1kg;
  return RULES.normal;
}

module.exports = { qtyRuleFor };
