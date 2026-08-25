import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_text_styles.dart';

/// Shared bottom navigation for the customer shell (Home/Products/Orders/Profile).
class RHRBottomNav extends StatelessWidget {
  final int currentIndex;
  const RHRBottomNav({super.key, required this.currentIndex});

  static const _routes = ['/home', '/catalogue', '/orders', '/profile'];
  static const _icons = [
    Icons.home_rounded,
    Icons.grid_view_rounded,
    Icons.shopping_cart_rounded,
    Icons.person_rounded,
  ];
  static const _labels = ['Home', 'Products', 'Orders', 'Account'];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: const Border(top: BorderSide(color: AppColors.outlineVariant)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(4, (i) {
              final selected = i == currentIndex;
              return GestureDetector(
                onTap: () {
                  if (i == currentIndex) return;
                  context.go(_routes[i]);
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  decoration: BoxDecoration(
                    color: selected ? AppColors.secondaryContainer : Colors.transparent,
                    borderRadius: BorderRadius.circular(AppRadius.full),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(_icons[i], size: 22,
                          color: selected ? AppColors.onSecondaryContainer : AppColors.onSurfaceVariant),
                      const SizedBox(height: 2),
                      Text(_labels[i], style: AppTextStyles.labelMd.copyWith(
                          fontSize: 10,
                          color: selected ? AppColors.onSecondaryContainer : AppColors.onSurfaceVariant)),
                    ],
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}
