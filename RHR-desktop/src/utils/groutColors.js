// The 24 Grout colours (same list and order as the apps' picker and the backend:
// RHR-frontend/lib/shared/grout_colors.dart, RHR-backend/src/utils/groutColors.js).
export const GROUT_COLORS = [
  { name: 'White', hex: '#FFFFFF' }, { name: 'Ivory', hex: '#F3EBD3' }, { name: 'Beige', hex: '#D9C7A0' },
  { name: 'Sand', hex: '#C9AE81' }, { name: 'Light Grey', hex: '#D1D3D7' }, { name: 'Grey', hex: '#9AA0AA' },
  { name: 'Dark Grey', hex: '#4B5563' }, { name: 'Black', hex: '#111111' }, { name: 'Brown', hex: '#7A4A2B' },
  { name: 'Dark Brown', hex: '#4A2A18' }, { name: 'Terracotta', hex: '#C0623B' }, { name: 'Red', hex: '#DC2626' },
  { name: 'Orange', hex: '#F97316' }, { name: 'Yellow', hex: '#FACC15' }, { name: 'Lime', hex: '#A3E635' },
  { name: 'Green', hex: '#16A34A' }, { name: 'Dark Green', hex: '#14532D' }, { name: 'Mint', hex: '#86EFAC' },
  { name: 'Aqua', hex: '#22D3EE' }, { name: 'Sky Blue', hex: '#60A5FA' }, { name: 'Blue', hex: '#2563EB' },
  { name: 'Navy', hex: '#1E3A8A' }, { name: 'Purple', hex: '#7C3AED' }, { name: 'Pink', hex: '#F472B6' },
];

// Each colour is ordered in sets of this many packets.
export const GROUT_STEP = 6;

const SEPARATOR = ' — ';

export const groutHex = (name) =>
  GROUT_COLORS.find((c) => c.name.toLowerCase() === String(name).toLowerCase())?.hex || '#CCCCCC';

// A product is a Grout when its category is Grout.
export const isGroutProduct = (product) =>
  String(product?.categories?.name || product?.category || '').toLowerCase().includes('grout');

// "Strong Hi-Mix Grout — White" -> { base: 'Strong Hi-Mix Grout', color: 'White' }; colour is null if the line has none.
export function splitLineName(productName = '') {
  const i = String(productName).lastIndexOf(SEPARATOR);
  if (i < 0) return { base: productName, color: null };
  const tail = productName.slice(i + SEPARATOR.length).trim();
  const found = GROUT_COLORS.find((c) => c.name.toLowerCase() === tail.toLowerCase());
  return found ? { base: productName.slice(0, i), color: found.name } : { base: productName, color: null };
}
