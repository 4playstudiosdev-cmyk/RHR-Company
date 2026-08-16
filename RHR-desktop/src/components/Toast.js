import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const showToast = useCallback(
    (message, type = 'success') => {
      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, message, type }]);
      timers.current[id] = setTimeout(() => dismiss(id), 3000);
    },
    [dismiss]
  );

  const toast = {
    success: (message) => showToast(message, 'success'),
    error: (message) => showToast(message, 'error')
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 w-80 max-w-[90vw]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in flex items-start gap-3 rounded-xl shadow-lg border px-4 py-3 text-sm font-medium ${
              t.type === 'success'
                ? 'bg-white border-green-200 text-gray-800'
                : 'bg-white border-red-200 text-gray-800'
            }`}
          >
            {t.type === 'success' ? (
              <CheckCircle2 size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <p className="flex-1">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
