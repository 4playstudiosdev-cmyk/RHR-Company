import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/constants/app_colors.dart';

/// Shared bottom navigation for the customer shell (Home/Products/Orders/Profile)
/// with a smooth icon scale animation on the selected tab.
class RHRBottomNav extends StatelessWidget {
  final int currentIndex;
  const RHRBottomNav({super.key, required this.currentIndex});

  static const _routes = ['/home', '/catalogue', '/orders', '/profile'];
  static const _icons = [
    Icons.home_outlined,
    Icons.shopping_bag_outlined,
    Icons.receipt_outlined,
    Icons.person_outline,
  ];
  static const _labels = ['Home', 'Products', 'Orders', 'Profile'];

  @override
  Widget build(BuildContext context) {
    return BottomNavigationBar(
      currentIndex: currentIndex,
      selectedItemColor: AppColors.orange,
      unselectedItemColor: AppColors.steelBlue,
      onTap: (i) {
        if (i == currentIndex) return;
        context.go(_routes[i]);
      },
      items: List.generate(
        4,
        (i) => BottomNavigationBarItem(
          icon: _AnimatedNavIcon(icon: _icons[i], selected: i == currentIndex),
          label: _labels[i],
        ),
      ),
    );
  }
}

class _AnimatedNavIcon extends StatelessWidget {
  final IconData icon;
  final bool selected;
  const _AnimatedNavIcon({required this.icon, required this.selected});

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      scale: selected ? 1.15 : 1.0,
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutBack,
      child: Icon(icon),
    );
  }
}
