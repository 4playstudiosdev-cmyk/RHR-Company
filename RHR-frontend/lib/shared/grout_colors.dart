import 'package:flutter/material.dart';

/// The 24 Grout colours, in the order they appear in the picker. Keep in sync
/// with RHR-backend/src/utils/groutColors.js and RHR-desktop/src/utils/groutColors.js.
class GroutColor {
  final String name;
  final Color color;
  const GroutColor(this.name, this.color);
}

const List<GroutColor> kGroutColors = [
  GroutColor('White', Color(0xFFFFFFFF)),
  GroutColor('Ivory', Color(0xFFF3EBD3)),
  GroutColor('Beige', Color(0xFFD9C7A0)),
  GroutColor('Sand', Color(0xFFC9AE81)),
  GroutColor('Light Grey', Color(0xFFD1D3D7)),
  GroutColor('Grey', Color(0xFF9AA0AA)),
  GroutColor('Dark Grey', Color(0xFF4B5563)),
  GroutColor('Black', Color(0xFF111111)),
  GroutColor('Brown', Color(0xFF7A4A2B)),
  GroutColor('Dark Brown', Color(0xFF4A2A18)),
  GroutColor('Terracotta', Color(0xFFC0623B)),
  GroutColor('Red', Color(0xFFDC2626)),
  GroutColor('Orange', Color(0xFFF97316)),
  GroutColor('Yellow', Color(0xFFFACC15)),
  GroutColor('Lime', Color(0xFFA3E635)),
  GroutColor('Green', Color(0xFF16A34A)),
  GroutColor('Dark Green', Color(0xFF14532D)),
  GroutColor('Mint', Color(0xFF86EFAC)),
  GroutColor('Aqua', Color(0xFF22D3EE)),
  GroutColor('Sky Blue', Color(0xFF60A5FA)),
  GroutColor('Blue', Color(0xFF2563EB)),
  GroutColor('Navy', Color(0xFF1E3A8A)),
  GroutColor('Purple', Color(0xFF7C3AED)),
  GroutColor('Pink', Color(0xFFF472B6)),
];

/// Each colour is ordered in sets of this many packets ("Har rang 6 packet ke set mein").
const int kGroutStep = 6;

/// Separator between a product's name and its colour in an order line, e.g.
/// "Strong Hi-Mix Grout — White". Matches what the server writes.
const String kGroutNameSeparator = ' — ';

Color groutColorFor(String name) =>
    kGroutColors.firstWhere((c) => c.name.toLowerCase() == name.toLowerCase(), orElse: () => const GroutColor('', Color(0xFFCCCCCC))).color;

/// A product is a Grout when its category is Grout (the category list holds
/// Tile Bond / Grout / Other).
bool isGroutProduct(Map<String, dynamic> product) {
  final cat = (product['categories'] is Map ? product['categories']['name'] : product['category']) ?? '';
  return cat.toString().toLowerCase().contains('grout');
}

/// Splits "Strong Hi-Mix Grout — White" into the colour part, or null.
String? colorOfLine(String productName) {
  final i = productName.lastIndexOf(kGroutNameSeparator);
  if (i < 0) return null;
  final tail = productName.substring(i + kGroutNameSeparator.length).trim();
  return kGroutColors.any((c) => c.name.toLowerCase() == tail.toLowerCase()) ? tail : null;
}
