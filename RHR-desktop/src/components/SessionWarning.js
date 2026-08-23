import { useState, useEffect } from 'react';

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // keep in sync with App.js

export default function SessionWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const check = () => {
      const loginTime = localStorage.getItem('rhr_login_time');
      if (!loginTime) return;

      const elapsed = Date.now() - parseInt(loginTime, 10);
      const remaining = SESSION_MAX_AGE_MS - elapsed;
      const minsLeft = Math.floor(remaining / 60000);

      if (minsLeft <= 15 && minsLeft > 0) {
        setShowWarning(true);
        setTimeLeft(minsLeft);
      }

      if (remaining <= 0) {
        localStorage.removeItem('rhr_token');
        localStorage.removeItem('rhr_user');
        localStorage.removeItem('rhr_login_time');
        window.location.reload();
      }
    };

    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!showWarning) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-orange text-white px-5 py-3 rounded-xl shadow-lg z-50 flex items-center gap-3">
      <span>⏰</span>
      <div>
        <div className="font-semibold text-sm">Session expiring soon</div>
        <div className="text-xs opacity-90">{timeLeft} minutes remaining</div>
      </div>
      <button
        onClick={() => {
          localStorage.setItem('rhr_login_time', Date.now().toString());
          setShowWarning(false);
        }}
        className="ml-2 bg-white text-orange px-3 py-1 rounded-lg text-xs font-bold"
      >
        Extend
      </button>
    </div>
  );
}
