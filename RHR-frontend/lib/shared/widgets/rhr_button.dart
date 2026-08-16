import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

class RHRButton extends StatefulWidget {
  final String text;
  final VoidCallback onPressed;
  final bool isSecondary;
  final bool isLoading;
  final double? width;

  const RHRButton({
    super.key,
    required this.text,
    required this.onPressed,
    this.isSecondary = false,
    this.isLoading = false,
    this.width,
  });

  @override
  State<RHRButton> createState() => _RHRButtonState();
}

class _RHRButtonState extends State<RHRButton> {
  double _scale = 1;

  void _setScale(double v) => setState(() => _scale = v);

  @override
  Widget build(BuildContext context) {
    final enabled = !widget.isLoading;
    return GestureDetector(
      onTapDown: enabled ? (_) => _setScale(0.95) : null,
      onTapUp: enabled ? (_) => _setScale(1) : null,
      onTapCancel: enabled ? () => _setScale(1) : null,
      onTap: enabled ? widget.onPressed : null,
      child: AnimatedScale(
        scale: _scale,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: SizedBox(
          width: widget.width ?? double.infinity,
          height: 52,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: widget.isSecondary ? AppColors.navy : AppColors.orange,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.12),
                    blurRadius: 6,
                    offset: const Offset(0, 2)),
              ],
            ),
            child: Center(
              child: widget.isLoading
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(color: AppColors.white, strokeWidth: 2.5),
                    )
                  : Text(
                      widget.text,
                      style: const TextStyle(
                        color: AppColors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
