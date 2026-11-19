import { useCallback, useEffect, useState } from 'react';

const KEY = 'rhr_theme';
const EVENT = 'rhr-theme-change';

export function getStoredTheme() {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
}

function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* storage unavailable — theme still applies for this session */ }
  applyTheme(theme);
  window.dispatchEvent(new Event(EVENT));
}

export function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme);

  useEffect(() => {
    const sync = () => setThemeState(getStoredTheme());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const toggle = useCallback(() => setTheme(getStoredTheme() === 'dark' ? 'light' : 'dark'), []);
  return { theme, isDark: theme === 'dark', toggle };
}
