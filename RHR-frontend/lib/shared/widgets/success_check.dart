import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

/// Shows a brief animated checkmark overlay (scale + fade in, then auto-dismiss)
/// for order/payment success moments. Awaiting the returned future lets the
/// caller navigate right after the animation finishes.
Future<void> showSuccessCheck(BuildContext context, {String message = 'Success!'}) {
  return showGeneralDialog(
    context: context,
    barrierDismissible: false,
    barrierColor: Colors.black.withValues(alpha: 0.35),
    transitionDuration: const Duration(milliseconds: 250),
    pageBuilder: (context, animation, secondaryAnimation) => const SizedBox.shrink(),
    transitionBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutBack);
      return Opacity(
        opacity: animation.value.clamp(0.0, 1.0),
        child: Transform.scale(
          scale: curved.value.clamp(0.0, 1.4),
          child: _SuccessCard(message: message),
        ),
      );
    },
  ).then((_) {});
}

class _SuccessCard extends StatefulWidget {
  final String message;
  const _SuccessCard({required this.message});

  @override
  State<_SuccessCard> createState() => _SuccessCardState();
}

class _SuccessCardState extends State<_SuccessCard> {
  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(milliseconds: 1100), () {
      if (mounted) Navigator.of(context).maybePop();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Material(
        color: Colors.transparent,
        child: Container(
          padding: const EdgeInsets.all(28),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 24)],
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 72,
              height: 72,
              decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
              child: const Icon(Icons.check_rounded, color: Colors.white, size: 44),
            ),
            const SizedBox(height: 16),
            Text(widget.message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.bold, fontSize: 15)),
          ]),
        ),
      ),
    );
  }
}
