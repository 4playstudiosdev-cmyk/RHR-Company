import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Pops back to whatever screen is actually underneath on the navigation
/// stack, instead of a hardcoded context.go(fallback) — which replaces
/// the whole stack and is why the Android back button/iOS swipe-back used
/// to exit the app entirely instead of returning to the previous screen
/// (every route in this app used to navigate with .go(), which never
/// leaves anything on the stack to pop). [fallback] only fires when
/// there's genuinely nothing to pop to — e.g. this screen was opened
/// directly via a deep link rather than by navigating from inside the app.
void goBack(BuildContext context, [String fallback = '/home']) {
  if (context.canPop()) {
    context.pop();
  } else {
    context.go(fallback);
  }
}

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
