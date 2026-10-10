// Mirrors the backend's convertQuantity (RHR-backend/src/utils/unitConversion.js)
// — used for live previews (recipe cost, stock totals) before saving;
// the real conversion that drives stored numbers always happens
// server-side. Returns null when the two units aren't a known matching
// family (e.g. "piece" vs "kg"), so callers can tell "already equal" apart
// from "can't convert this".
const WEIGHT_TO_GRAMS = { mg: 0.001, g: 1, gm: 1, gram: 1, grams: 1, kg: 1000, kgs: 1000, ton: 1000000 };
const VOLUME_TO_ML = { ml: 1, l: 1000, litre: 1000, liter: 1000, litres: 1000, liters: 1000 };

export function convertQuantity(value, fromUnit, toUnit) {
  const from = (fromUnit || '').toLowerCase().trim();
  const to = (toUnit || '').toLowerCase().trim();
  if (!from || !to || from === to) return value;
  if (WEIGHT_TO_GRAMS[from] && WEIGHT_TO_GRAMS[to]) return (value * WEIGHT_TO_GRAMS[from]) / WEIGHT_TO_GRAMS[to];
  if (VOLUME_TO_ML[from] && VOLUME_TO_ML[to]) return (value * VOLUME_TO_ML[from]) / VOLUME_TO_ML[to];
  return null;
}
