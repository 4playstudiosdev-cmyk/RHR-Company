import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellRing, X, LogIn, Megaphone } from 'lucide-react';
import api from '../services/api';

const TYPE_ICON = {
  admin_login: LogIn,
  broadcast: Megaphone,
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

// Floating "always visible" bell (bottom-right, WhatsApp-Web-style) showing
// a preview of the logged-in user's own notifications (same /notifications
// endpoint Sidebar's nav-item badge already polls, just not restricted to
// super_admin/admin_login — this surfaces everything targeted at the user).
// Doesn't call /notifications/mark-read itself — that stays tied to
// actually opening the Notifications page (see Sidebar.js), so this
// preview popup doesn't silently clear a badge the user hasn't acted on.
export default function NotificationBell({ setPage }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const containerRef = useRef(null);

  const fetchNotifications = () => {
    api.get('/notifications')
      .then((res) => { if (res.data.success) setNotifications(res.data.data || []); })
      .catch(() => {});
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const recent = notifications.slice(0, 10);

  const goToNotifications = () => {
    setOpen(false);
    setPage('notifications');
  };

  return (
    <div className="fixed bottom-6 right-6 z-40" ref={containerRef}>
      {open && (
        <div className="absolute bottom-16 right-0 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-navy">
            <div className="flex items-center gap-2">
              <BellRing size={18} className="text-white" />
              <span className="text-white font-semibold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close">
              <X size={18} className="text-white hover:text-blue-200" />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {recent.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">
                <Bell size={28} className="mx-auto mb-2 text-gray-300" />
                No notifications yet
              </div>
            ) : (
              recent.map((n) => {
                const Icon = TYPE_ICON[n.type] || Bell;
                return (
                  <div
                    key={n.id}
                    className={`px-4 py-3 hover:bg-gray-50 transition-colors ${
                      !n.is_read ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="w-7 h-7 rounded-lg bg-navy-chip text-navy flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon size={14} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 font-medium leading-snug line-clamp-2">
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{n.body}</p>
                        )}
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs text-gray-400">{getTimeAgo(n.created_at)}</span>
                          <button
                            onClick={goToNotifications}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline"
                          >
                            View Details →
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
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
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative w-14 h-14 bg-navy hover:bg-navy/90 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
      >
        {unreadCount > 0 ? <BellRing size={24} className="text-white" /> : <Bell size={24} className="text-white" />}

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1 shadow-lg">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {unreadCount > 0 && (
          <span className="absolute inset-0 rounded-full bg-navy animate-ping opacity-20" />
        )}
      </button>
    </div>
  );
}
