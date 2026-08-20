import axios from 'axios';

export const DEFAULT_API_URL = 'https://rhr-company-production.up.railway.app/api/v1';
const STORAGE_KEY = 'rhr_api_url';

// Reads the backend base URL from localStorage (set via the Server Settings
// modal — see components/ServerSettingsModal.js), falling back to localhost.
// This is what lets the packaged .exe point at a different machine's IP
// on the LAN without a rebuild.
export const getApiUrl = () => localStorage.getItem(STORAGE_KEY) || DEFAULT_API_URL;

export const setApiUrl = (url) => localStorage.setItem(STORAGE_KEY, url);

const api = axios.create({
  baseURL: getApiUrl(),
  timeout: 30000
});

api.interceptors.request.use((config) => {
  // Re-read on every request in case Server Settings changed it since the
  // client was created.
  config.baseURL = getApiUrl();
  const token = localStorage.getItem('rhr_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on an expired/invalid token
api.interceptors.response.use(
  (response) => response,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('rhr_token');
      localStorage.removeItem('rhr_user');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export default api;

// ========= PRODUCTION MODULE — live, all admin-only =========
// GET   /api/v1/production/demand                 — demand computed live from order_items on
//                                                    orders not yet dispatched (pending/confirmed/preparing)
// GET   /api/v1/production/orders                  — all production orders
// POST  /api/v1/production/orders                  — create production order
// PATCH /api/v1/production/orders/:id/status        — update status (pending/in_production/ready/dispatched)
// GET   /api/v1/production/materials                — raw materials list
// POST  /api/v1/production/materials                — add material
// PATCH /api/v1/production/materials/:id/stock       — add stock (also logs to raw_material_stock_logs)
// GET   /api/v1/production/dispatch                  — dispatch records
// POST  /api/v1/production/dispatch                  — dispatch a "ready" production order (sets it to dispatched)
// PATCH /api/v1/production/dispatch/:id/deliver       — mark delivered
// GET   /api/v1/production/reports/daily              — { series, records } — from production_orders.start_date
// GET   /api/v1/production/reports/consumption         — { available: false, materials } — no recipe/BOM
//                                                         system yet, so real consumption can't be derived
// GET   /api/v1/production/reports/stock                — current raw material stock
//
// Backend: RHR-backend/src/controllers/{production,rawMaterials,dispatch,productionReports}.controller.js
// Schema: RHR-backend/sql/phase7_production_module.sql (must be run in
// Supabase before these endpoints work — see that file for details).
