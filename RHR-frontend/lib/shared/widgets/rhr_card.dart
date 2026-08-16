import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

class RHRCard extends StatefulWidget {
  final Widget child;
  final EdgeInsets? padding;
  final VoidCallback? onTap;
  final bool showOrangeTop;

  const RHRCard({
    super.key,
    required this.child,
    this.padding,
    this.onTap,
    this.showOrangeTop = false,
  });

  @override
  State<RHRCard> createState() => _RHRCardState();
}

class _RHRCardState extends State<RHRCard> {
  double _scale = 1;
  double _blur = 12;

  void _press(bool down) => setState(() {
        _scale = down ? 0.97 : 1;
        _blur = down ? 6 : 12;
      });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: widget.onTap == null ? null : (_) => _press(true),
      onTapUp: widget.onTap == null ? null : (_) => _press(false),
      onTapCancel: widget.onTap == null ? null : () => _press(false),
      child: AnimatedScale(
        scale: _scale,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.08),
                blurRadius: _blur,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (widget.showOrangeTop)
                  Container(
                    height: 4,
                    color: AppColors.orange,
                  ),
                Padding(
                  padding: widget.padding ?? const EdgeInsets.all(16),
                  child: widget.child,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}