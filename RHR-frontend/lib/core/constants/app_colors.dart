import 'package:flutter/material.dart';

/// "Industrial Integrity System" design tokens — matches the Material 3
/// palette embedded in the Stitch-generated HTML mockups (identical across
/// all 14 screens' tailwind.config), not the slightly different frontmatter
/// in DESIGN.md, which is an untuned generic template.
class AppColors {
  static const Color primary = Color(0xFF00185D);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color primaryContainer = Color(0xFF00298F);
  static const Color onPrimaryContainer = Color(0xFF7F98FF);
  static const Color primaryFixed = Color(0xFFDDE1FF);
  static const Color primaryFixedDim = Color(0xFFB7C4FF);
  static const Color onPrimaryFixed = Color(0xFF001453);
  static const Color onPrimaryFixedVariant = Color(0xFF203DA1);
  static const Color inversePrimary = Color(0xFFB7C4FF);
  static const Color surfaceTint = Color(0xFF3C57BA);

  static const Color secondary = Color(0xFF545C84);
  static const Color onSecondary = Color(0xFFFFFFFF);
  static const Color secondaryContainer = Color(0xFFC7CFFD);
  static const Color onSecondaryContainer = Color(0xFF4F587F);
  static const Color secondaryFixed = Color(0xFFDDE1FF);
  static const Color secondaryFixedDim = Color(0xFFBCC4F2);
  static const Color onSecondaryFixed = Color(0xFF0F193D);
  static const Color onSecondaryFixedVariant = Color(0xFF3C456B);

  static const Color tertiary = Color(0xFF450900);
  static const Color onTertiary = Color(0xFFFFFFFF);
  static const Color tertiaryContainer = Color(0xFF6A1501);
  static const Color onTertiaryContainer = Color(0xFFF57B5C);
  static const Color tertiaryFixed = Color(0xFFFFDAD2);
  static const Color tertiaryFixedDim = Color(0xFFFFB4A2);
  static const Color onTertiaryFixed = Color(0xFF3C0700);
  static const Color onTertiaryFixedVariant = Color(0xFF82270F);

  static const Color error = Color(0xFFBA1A1A);
  static const Color onError = Color(0xFFFFFFFF);
  static const Color errorContainer = Color(0xFFFFDAD6);
  static const Color onErrorContainer = Color(0xFF93000A);
  static const Color success = Color(0xFF2D7A3A);

  static const Color background = Color(0xFFFBF8FF);
  static const Color onBackground = Color(0xFF1A1B22);
  static const Color surface = Color(0xFFFBF8FF);
  static const Color onSurface = Color(0xFF1A1B22);
  static const Color surfaceDim = Color(0xFFDAD9E2);
  static const Color surfaceBright = Color(0xFFFBF8FF);
  static const Color surfaceContainerLowest = Color(0xFFFFFFFF);
  static const Color surfaceContainerLow = Color(0xFFF4F2FC);
  static const Color surfaceContainer = Color(0xFFEEEDF6);
  static const Color surfaceContainerHigh = Color(0xFFE8E7F0);
  static const Color surfaceContainerHighest = Color(0xFFE3E1EA);
  static const Color onSurfaceVariant = Color(0xFF444652);
  static const Color surfaceVariant = Color(0xFFE3E1EA);
  static const Color inverseSurface = Color(0xFF2F3037);
  static const Color inverseOnSurface = Color(0xFFF1F0F9);
  static const Color outline = Color(0xFF757684);
  static const Color outlineVariant = Color(0xFFC5C5D4);

  // Legacy names kept as aliases so existing call sites (many screens still
  // being migrated) keep compiling during the rollout — point at the
  // closest equivalent in the new palette.
  static const Color navy = primary;
  static const Color orange = tertiaryFixedDim;
  static const Color white = Colors.white;
  static const Color warmGrey = surfaceContainerLow;
  static const Color steelBlue = secondary;
  static const Color charcoal = onSurface;
  static const Color green = success;
  static const Color disabled = outlineVariant;
}

/// 8px-rhythm spacing scale from DESIGN.md.
class AppSpacing {
  static const double xs = 4;
  static const double base = 8;
  static const double sm = 12;
  static const double md = 24;
  static const double lg = 48;
  static const double xl = 80;
  static const double gutter = 24;
  static const double marginMobile = 16;
}

/// Corner radii from DESIGN.md's Shapes section.
class AppRadius {
  static const double sm = 4;
  static const double base = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double full = 9999;
}
