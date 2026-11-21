// One rule for what an order costs, shared by the order previews and the
// invoice reprint — same as the backend (orderLedger.service syncOrderTotal):
//   subtotal   = sum of the item lines
//   conveyance = the saved invoice_conveyance
//   sales tax  = 18% of the subtotal when the invoice was made "with tax"
//   total      = subtotal + conveyance + sales tax
export const TAX_RATE = 0.18;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export function orderCharges(order) {
  const items = order?.order_items || order?.items || [];
  const conveyance = round2(order?.invoice_conveyance);
  const itemsSum = round2(items.reduce((s, it) => s + Number(it.subtotal || 0), 0));
  const subtotal = itemsSum > 0 ? itemsSum : Math.max(0, round2(Number(order?.total_amount || 0) - conveyance));
  const tax = order?.invoice_with_tax ? round2(subtotal * TAX_RATE) : 0;
  return { subtotal, conveyance, tax, total: round2(subtotal + conveyance + tax) };
}

// Rows for a preview footer: Subtotal is always shown; Conveyance and Sales Tax
// only when the order has them.
export function chargeRows(order) {
  const c = orderCharges(order);
  const rows = [['Subtotal', c.subtotal]];
  if (c.conveyance > 0) rows.push(['Conveyance', c.conveyance]);
  if (c.tax > 0) rows.push(['Sales Tax (18%)', c.tax]);
  return { rows, total: c.total };
}
