import 'package:flutter/material.dart';
import 'app_colors.dart';

class AppTextStyles {
  static const TextStyle heading1 = TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.bold,
    color: AppColors.navy,
  );

  static const TextStyle heading2 = TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.bold,
    color: AppColors.navy,
  );

  static const TextStyle heading3 = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w600,
    color: AppColors.navy,
  );

  static const TextStyle body = TextStyle(
    fontSize: 14,
    color: AppColors.charcoal,
  );

  static const TextStyle bodySmall = TextStyle(
    fontSize: 12,
    color: AppColors.steelBlue,
  );

  static const TextStyle price = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.bold,
    color: AppColors.orange,
  );

  static const TextStyle buttonText = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.bold,
    color: AppColors.white,
  );
}