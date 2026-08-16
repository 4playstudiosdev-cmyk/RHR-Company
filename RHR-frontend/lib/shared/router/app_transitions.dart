import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Shared slide+fade page transition used by every route so navigation
/// feels consistent across the whole app.
CustomTransitionPage<void> slidePage(GoRouterState state, Widget child) {
  return CustomTransitionPage<void>(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 300),
    reverseTransitionDuration: const Duration(milliseconds: 250),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
      return SlideTransition(
        position: Tween<Offset>(begin: const Offset(0.06, 0), end: Offset.zero).animate(curved),
        child: FadeTransition(opacity: curved, child: child),
      );
    },
  );
}
