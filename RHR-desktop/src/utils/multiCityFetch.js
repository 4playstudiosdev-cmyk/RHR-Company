import api from '../services/api';

// Same 3 company IDs the CityFilter dropdown uses.
export const CITY_IDS = [
  '1e5962c6-33a7-460b-913e-9e08db46973a', // Karachi
  '09a1fda3-7ac0-406a-8f42-75d973dc3b7e', // Hyderabad
  '00f79d89-0d36-4704-8865-fc7bbd662267', // Sukkur
];

// Fetches `endpoint` once per branch (in parallel) and concatenates the
// results — used whenever the CityFilter dropdown is set to "All Cities"
// so totals are genuinely combined across all 3 branches, rather than
// relying on the backend's single unfiltered-query path. A combined,
// unfiltered result set is exactly the shape of request that's previously
// tripped the supabase-js-on-Railway silent-empty-response bug documented
// in RHR-backend/src/utils/directQuery.js, so fetching each branch
// separately (smaller, filtered requests) sidesteps that risk too.
export async function fetchAllCities(endpoint, extraParams = {}) {
  const results = await Promise.all(
    CITY_IDS.map((company_id) => api.get(endpoint, { params: { ...extraParams, company_id } }))
  );
  return results.flatMap((r) => r.data.data || []);
}

// Groups rows by (trimmed, case-insensitive) `name` and sums the given
// numeric fields — for catalog-type data (products, raw materials) where
// each branch holds its own copy of the same item, so "All Cities" should
// read as one row per item with combined totals, not one row per branch.
export function groupByName(rows, sumFields) {
  const byName = new Map();
  rows.forEach((row) => {
    const key = row.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      const copy = { ...row };
      sumFields.forEach((f) => { copy[f] = Number(row[f]) || 0; });
      byName.set(key, copy);
    } else {
      sumFields.forEach((f) => { existing[f] += Number(row[f]) || 0; });
    }
  });
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}
