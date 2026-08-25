import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Typography scale from DESIGN.md — Work Sans for headlines, Inter for
/// body/label text. Colors are intentionally omitted here; apply with
/// `.copyWith(color: ...)` per usage (matches the HTML mockups, which
/// reuse the same type scale across many different text colors).
class AppTextStyles {
  static TextStyle get headlineXl => GoogleFonts.workSans(
        fontSize: 40,
        fontWeight: FontWeight.w700,
        height: 48 / 40,
        letterSpacing: -0.02 * 40,
      );

  static TextStyle get headlineLg => GoogleFonts.workSans(
        fontSize: 32,
        fontWeight: FontWeight.w700,
        height: 40 / 32,
        letterSpacing: -0.01 * 32,
      );

  static TextStyle get headlineLgMobile => GoogleFonts.workSans(
        fontSize: 28,
        fontWeight: FontWeight.w700,
        height: 36 / 28,
      );

  static TextStyle get headlineMd => GoogleFonts.workSans(
        fontSize: 24,
        fontWeight: FontWeight.w600,
        height: 32 / 24,
      );

  static TextStyle get headlineSm => GoogleFonts.workSans(
        fontSize: 20,
        fontWeight: FontWeight.w600,
        height: 28 / 20,
      );

  static TextStyle get bodyLg => GoogleFonts.inter(
        fontSize: 18,
        fontWeight: FontWeight.w400,
        height: 28 / 18,
      );

  static TextStyle get bodyMd => GoogleFonts.inter(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        height: 24 / 16,
      );

  static TextStyle get bodySm => GoogleFonts.inter(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        height: 20 / 14,
      );

  static TextStyle get labelMd => GoogleFonts.inter(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        height: 16 / 14,
        letterSpacing: 0.05 * 14,
      );
}
