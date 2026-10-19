// Order quantity rule — the same for every product, customer and role.
// Mirrors the mobile app's lib/shared/order_qty_rules.dart and the backend's
// src/utils/orderQtyRules.js — keep all three in sync.
//   * no per-product minimum — any quantity of any item;
//   * the TOTAL quantity of the whole order must be at least MIN_TOTAL_QTY
//     (49 is rejected, 50 or more is fine);
//   * the − / + buttons step by QTY_STEP; the quantity can also be typed.
export const MIN_TOTAL_QTY = 50;
export const QTY_STEP = 10;
