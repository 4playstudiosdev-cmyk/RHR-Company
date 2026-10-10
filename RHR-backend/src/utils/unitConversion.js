// Converts a plain weight/volume unit into another of the same kind (e.g.
// kg -> gm so a material purchased by the bag but tracked in grams gets
// the right number added to stock). Units outside these two families
// (piece, bag, litre-less liquids not listed, etc.) have no fixed ratio
// to convert by, so convertQuantity falls back to returning the value
// unchanged rather than guessing.
const WEIGHT_TO_GRAMS = {
  mg: 0.001,
  g: 1, gm: 1, gram: 1, grams: 1,
  kg: 1000, kgs: 1000, kilogram: 1000, kilograms: 1000,
  ton: 1000000, tonne: 1000000, tons: 1000000,
};

const VOLUME_TO_ML = {
  ml: 1,
  l: 1000, litre: 1000, liter: 1000, litres: 1000, liters: 1000,
};

function normalize(unit) {
  return String(unit || '').trim().toLowerCase();
}

// Returns null (not a no-op value) when the two units aren't in the same
// recognized family, so callers can tell "already equal/converted" apart
// from "couldn't convert, don't trust this number".
function convertQuantity(value, fromUnit, toUnit) {
  const from = normalize(fromUnit);
  const to = normalize(toUnit);
  if (!from || !to || from === to) return value;

  if (WEIGHT_TO_GRAMS[from] && WEIGHT_TO_GRAMS[to]) {
    return (value * WEIGHT_TO_GRAMS[from]) / WEIGHT_TO_GRAMS[to];
  }
  if (VOLUME_TO_ML[from] && VOLUME_TO_ML[to]) {
    return (value * VOLUME_TO_ML[from]) / VOLUME_TO_ML[to];
  }
  return null;
}

module.exports = { convertQuantity };
