import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './dark.css';
import App from './App';
import { applyTheme, getStoredTheme } from './utils/theme';

// Apply before first paint so a saved dark theme never flashes light.
applyTheme(getStoredTheme());

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
