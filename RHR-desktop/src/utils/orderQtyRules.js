// Per-product minimum order quantity + stepper increment, based on how
// each product line is actually packaged/sold. Mirrors the mobile app's
// lib/shared/order_qty_rules.dart and the backend's
// src/utils/orderQtyRules.js — keep all three in sync.
const RULES = {
  tileBond: { min: 50, step: 10 },
  grout: { min: 6, step: 6 },
  maproCement: { min: 25, step: 25 },
  normal: { min: 1, step: 1 },
};

export function qtyRuleFor(name = '', category = '') {
  const n = String(name).toLowerCase();
  const c = String(category).toLowerCase();
  if (c.includes('tile bond')) return RULES.tileBond;
  if (c.includes('grout')) return RULES.grout;
  if (n.includes('mapro')) return RULES.maproCement;
  return RULES.normal;
}

export function qtyRuleForProduct(product) {
  return qtyRuleFor(product?.name, product?.categories?.name);
}
