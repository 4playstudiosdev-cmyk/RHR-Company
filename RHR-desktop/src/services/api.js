import axios from 'axios';

export const DEFAULT_API_URL =
  process.env.REACT_APP_API_URL || 'https://rhr-company-production.up.railway.app/api/v1';

const api = axios.create({
  baseURL: DEFAULT_API_URL,
  timeout: 30000
});

api.interceptors.request.use((config) => {
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
      localStorage.removeItem('rhr_login_time');
      // This app has no client-side router — reload() re-runs AppShell,
      // which already renders <Login/> whenever there's no token.
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('rhr_user') || 'null');
  } catch {
    return null;
  }
};

// perms[permission] === false is the only way a feature gets disabled —
// everything is allowed by default (including before the `permissions`
// column/admin-management feature existed), so a missing/empty
// permissions object never accidentally locks anyone out.
export const hasPermission = (permission, user = getCurrentUser()) => {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const perms = user.permissions || {};
  return perms[permission] !== false;
};

export const isRole = (...roles) => {
  const user = getCurrentUser();
  return user ? roles.includes(user.role) : false;
};

export default api;

// RECIPES
export const getRecipes            = () => api.get('/recipes');
export const createRecipe          = (data) => api.post('/recipes', data);
export const deleteRecipe          = (id) => api.delete(`/recipes/${id}`);
export const getFinishedProducts   = () => api.get('/recipes/finished-products');
export const getRecipeRawMaterials = () => api.get('/recipes/raw-materials');

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
