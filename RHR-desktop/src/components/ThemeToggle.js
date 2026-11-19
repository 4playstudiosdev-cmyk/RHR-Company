import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../utils/theme';

export default function ThemeToggle({ className = '', iconSize = 18 }) {
  const { isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className={className}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun size={iconSize} /> : <Moon size={iconSize} />}
    </button>
  );
}
