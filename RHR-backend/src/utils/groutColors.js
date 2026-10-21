// The 24 Grout colours (same list, same order as the picker in the apps and the
// admin desktop: RHR-frontend/lib/shared/grout_colors.dart and
// RHR-desktop/src/utils/groutColors.js — keep all three in sync).
const GROUT_COLORS = [
  'White', 'Ivory', 'Beige', 'Sand', 'Light Grey', 'Grey', 'Dark Grey', 'Black',
  'Brown', 'Dark Brown', 'Terracotta', 'Red', 'Orange', 'Yellow', 'Lime', 'Green',
  'Dark Green', 'Mint', 'Aqua', 'Sky Blue', 'Blue', 'Navy', 'Purple', 'Pink',
];

// Separator between product name and colour in an order line, e.g.
// "Strong Hi-Mix Grout — White". The colour lives in the line's name (a snapshot,
// like the price) so it shows everywhere an order line does — admin order detail,
// invoice, WhatsApp and app notifications — without a database change.
const NAME_SEPARATOR = ' — ';

// Returns the canonical colour name for what the client sent, or null if it isn't one of the 24.
function canonicalColor(input) {
  if (input == null || String(input).trim() === '') return null;
  const wanted = String(input).trim().toLowerCase();
  return GROUT_COLORS.find((c) => c.toLowerCase() === wanted) || null;
}

const isGroutCategory = (name) => String(name || '').toLowerCase().includes('grout');

module.exports = { GROUT_COLORS, NAME_SEPARATOR, canonicalColor, isGroutCategory };
