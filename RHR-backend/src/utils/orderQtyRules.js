// Order quantity rule (same everywhere — customer app, salesman/driver app,
// admin desktop; the apps mirror this in lib/shared/order_qty_rules.dart and
// src/utils/orderQtyRules.js — keep all three in sync):
//   * no per-product / per-category minimum — any quantity of any item;
//   * the TOTAL quantity of the whole order (all items together) must be at
//     least MIN_TOTAL_QTY. 49 is rejected, 50 or more is fine.
// The +/- buttons in the apps step by STEP; the quantity can also be typed.
const MIN_TOTAL_QTY = 50;
const STEP = 10;

module.exports = { MIN_TOTAL_QTY, STEP };
