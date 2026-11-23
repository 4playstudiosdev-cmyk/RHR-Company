import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellRing, X, LogIn, Megaphone, ShoppingCart, Wallet, UserPlus, Clock, Users, UserCog, Car, HandCoins, FileCheck, FileText, ArrowLeftRight } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import { routeForNotification, isUnreadAlert } from '../utils/notificationRoute';

// icon per pending item kind (see GET /pending-counts/items)
const KIND_ICON = {
  order: ShoppingCart,
  recovery: HandCoins,
  cash_closing: Wallet,
  amount_change: ArrowLeftRight,
  cheque: FileText,
  customer: Users,
  salesman: UserCog,
  driver: Car,
  payment: Wallet,
  leave: FileCheck,
};

const TYPE_ICON = {
  admin_login: LogIn,
  broadcast: Megaphone,
  order: ShoppingCart,
  payment: Wallet,
  registration: UserPlus,
};

function getTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Floating bell (bottom-right). Two parts:
//  • Needs attention — every item still waiting on an admin (pending order,
//    recovery, cheque, vendor amount change, approval...), one red line each,
//    newest first. An item leaves the list only once it is done.
//    The badge number is exactly how many of these there are — the same count
//    the sidebar badges and the Salesman Recovery tabs show.
//  • Notifications — an unread admin alert stays red until it is clicked
//    (that one is marked read) or "Mark all read" is used.
export default function NotificationBell({ setPage, onViewOrderNumber, onNavigate, companyFilter, refreshKey }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [pendingItems, setPendingItems] = useState([]);
  const containerRef = useRef(null);

  const fetchNotifications = () => {
    api.get('/notifications')
      .then((res) => { if (res.data.success) setNotifications(res.data.data || []); })
      .catch(() => {});
  };

  const fetchPending = () => {
    const params = companyFilter ? { company_id: companyFilter } : {};
    api.get('/pending-counts/items', { params })
      .then((res) => { if (res.data.success) setPendingItems(res.data.data?.items || []); })
      .catch(() => {});
  };

  // Initial load + periodic refresh
  useEffect(() => {
    fetchNotifications();
    fetchPending();
    const i1 = setInterval(fetchNotifications, 30000);
    const i2 = setInterval(fetchPending, 20000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [companyFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch (without destroying state/badge) when parent triggers a refresh
  useEffect(() => {
    if (refreshKey) { fetchNotifications(); fetchPending(); }
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const user = getCurrentUser();
  const showCity = !companyFilter && new Set(pendingItems.map((it) => it.city).filter(Boolean)).size > 1;
  const unreadAlerts = notifications.filter((n) => isUnreadAlert(n, user));
  const unreadCount = unreadAlerts.length;
  const pendingCount = pendingItems.length;
  const badgeCount = pendingCount + unreadCount;
  // every unread alert first (newest first), then the latest read ones to fill the list
  const unreadIds = new Set(unreadAlerts.map((n) => n.id));
  const recent = [
    ...unreadAlerts.slice(0, 30),
    ...notifications.filter((n) => !unreadIds.has(n.id)).slice(0, Math.max(0, 8 - unreadAlerts.length)),
  ];

  const markOneRead = (n) => {
    if (n.is_read) return;
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    api.patch(`/notifications/${n.id}/read`).catch(() => {});
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    api.patch('/notifications/mark-read').catch(() => {});
  };

  const goToNotifications = () => {
    setOpen(false);
    setPage('notifications');
  };

  const goTo = (route) => {
    setOpen(false);
    if (route?.order) onViewOrderNumber?.(route.order);
    else if (route?.page && onNavigate) onNavigate(route.page, route.tab);
    else if (route?.page) setPage(route.page);
  };

  // A notification about something still pending is the same thing as its
  // Needs-attention line — opening it marks it read too.
  const handleNotificationClick = (n) => {
    markOneRead(n);
    goTo(routeForNotification(n));
  };

  const handlePendingClick = (it) => {
    notifications
      .filter((n) => !n.is_read && n.reference_id && (it.ref_ids || [it.id]).includes(n.reference_id))
      .forEach(markOneRead);
    goTo(it.route);
  };

  const handleToggle = () => {
    setOpen((o) => {
      if (!o) { fetchNotifications(); fetchPending(); } // fresh list every time it opens
      return !o;
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-40" ref={containerRef}>
      {open && (
        <div className="absolute bottom-16 right-0 w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-navy">
            <div className="flex items-center gap-2 min-w-0">
              <BellRing size={18} className="text-white flex-shrink-0" />
              <span className="text-white font-semibold text-sm">Notifications</span>
              {pendingCount > 0 && (
                <span className="text-white text-xs font-bold px-2 py-0.5 rounded-full bg-red-500 whitespace-nowrap">
                  {pendingCount} pending
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[11px] font-semibold text-blue-100 hover:text-white hover:underline whitespace-nowrap">
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close">
                <X size={18} className="text-white hover:text-blue-200" />
              </button>
            </div>
          </div>

          <div className="max-h-[28rem] overflow-y-auto divide-y divide-gray-50">
            {/* Needs attention — one line per pending item, oldest first */}
            {pendingCount > 0 && (
              <div className="border-b border-red-100">
                <div className="px-4 py-2 flex items-center justify-between bg-red-50">
                  <span className="flex items-center gap-2">
                    <Clock size={13} className="text-red-600" />
                    <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Needs Attention</span>
                  </span>
                  <span className="text-[11px] font-bold text-red-600">{pendingCount} not done</span>
                </div>
                {pendingItems.map((it) => {
                  const Icon = KIND_ICON[it.kind] || Clock;
                  return (
                    <div
                      key={`${it.kind}-${it.id}`}
                      onClick={() => handlePendingClick(it)}
                      title="Not done yet — click to open"
                      className="px-4 py-2.5 cursor-pointer flex items-start gap-3 transition-colors border-l-4 border-l-red-500 bg-red-50/60 hover:bg-red-100"
                    >
                      <span className="w-7 h-7 rounded-lg bg-red-500 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon size={14} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-red-700 leading-snug">
                          {showCity && it.city && (
                            <span className="inline-block mr-1.5 px-1.5 py-px rounded bg-navy text-white text-[10px] font-bold align-middle">{it.city}</span>
                          )}
                          {it.title}
                        </p>
                        {it.body && <p className="text-xs text-gray-700 mt-0.5 line-clamp-2">{it.body}</p>}
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-red-500 font-semibold">waiting {getTimeAgo(it.at).replace(' ago', '')}</span>
                          <span className="text-xs text-blue-600 font-medium">Open →</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Notifications section */}
            {recent.length === 0 && pendingCount === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">
                <Bell size={28} className="mx-auto mb-2 text-gray-300" />
                No notifications yet
              </div>
            ) : recent.length > 0 && (
              <>
                <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="text-[11px] font-bold text-red-600">{unreadCount} unread</span>
                  )}
                </div>
                {recent.map((n) => {
                  const Icon = TYPE_ICON[n.type] || Bell;
                  const unread = unreadIds.has(n.id);
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      title={unread ? 'Unread — click to open' : undefined}
                      className={`px-4 py-3 transition-colors cursor-pointer border-l-4 ${
                        unread ? 'bg-red-50 border-l-red-500 hover:bg-red-100' : 'border-l-transparent hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`relative w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          unread ? 'bg-red-500 text-white' : 'bg-navy-chip text-navy'
                        }`}>
                          <Icon size={14} />
                          {unread && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-white animate-pulse" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-snug line-clamp-2 ${unread ? 'text-red-700 font-bold' : 'text-gray-800 font-medium'}`}>
                            {unread && <span className="inline-block mr-1.5 px-1.5 py-px rounded bg-red-600 text-white text-[10px] font-bold align-middle">NEW</span>}
                            {n.title}
                          </p>
                          {n.body && (
                            <p className={`text-xs mt-0.5 line-clamp-2 ${unread ? 'text-gray-700' : 'text-gray-500'}`}>{n.body}</p>
                          )}
                          <div className="flex items-center justify-between mt-1.5">
                            <span className={`text-xs ${unread ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>{getTimeAgo(n.created_at)}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleNotificationClick(n); }}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline"
                            >
                              View Details →
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <button
              onClick={goToNotifications}
              className="w-full text-center text-sm text-navy font-semibold hover:underline"
            >
              View All Notifications →
            </button>
          </div>
        </div>
      )}

      <button
        onClick={handleToggle}
        aria-label="Notifications"
        title={badgeCount > 0 ? `${pendingCount} pending${unreadCount ? ` · ${unreadCount} unread` : ''}` : 'Notifications'}
        className="relative w-14 h-14 bg-navy hover:bg-navy/90 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
      >
        {badgeCount > 0 ? <BellRing size={24} className="text-white" /> : <Bell size={24} className="text-white" />}

        {badgeCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1 shadow-lg">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}

        {badgeCount > 0 && (
          <span className="absolute inset-0 rounded-full bg-navy animate-ping opacity-20" />
        )}
      </button>
    </div>
  );
}
