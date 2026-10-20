// Where "View Details" on a notification should land: the panel — and, where
// it matters, the tab — the notification is actually about.
// Returns { order: <id> } for an order, or { page, tab? }.
//
// Payment notifications all share type 'payment' (the salesman app routes on that),
// so the admin side tells them apart by their title.
export function routeForNotification(n) {
  const type = n?.type;
  const title = String(n?.title || '');

  if ((type === 'order' || type === 'order_urgent') && n.reference_id) return { order: n.reference_id };

  if (type === 'payment') {
    // a salesman-recorded bank transfer waiting for approval -> Salesman Recovery > Pending Approvals
    if (/awaiting approval/i.test(title)) return { page: 'recovery', tab: 'pending' };
    // driver collected cash on delivery
    if (/payment collected/i.test(title)) return { page: 'driver-recovery' };
    // salesman recovery results (recorded / approved / rejected, deposits) -> Salesman Recovery > History
    if (/^(payment|deposit) (recorded|approved|rejected)/i.test(title)) return { page: 'recovery', tab: 'history' };
    // customer-submitted payments (the older Payments flow)
    return { page: 'payments' };
  }

  if (type === 'registration') {
    if (/driver/i.test(title)) return { page: 'vehicles' };
    if (/salesman/i.test(title)) return { page: 'salesmen' };
    return { page: 'customers' };
  }
  if (type === 'attendance') return { page: 'hrm' };

  return { page: 'notifications' };
}

export const isRoutable = (n) => {
  const r = routeForNotification(n);
  return !!r.order || (r.page && r.page !== 'notifications');
};
