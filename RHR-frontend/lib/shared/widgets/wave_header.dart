import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_text_styles.dart';

class _WaveClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final path = Path();
    path.lineTo(0, size.height - 24);
    path.quadraticBezierTo(size.width * 0.25, size.height, size.width * 0.5, size.height - 12);
    path.quadraticBezierTo(size.width * 0.75, size.height - 24, size.width, size.height - 4);
    path.lineTo(size.width, 0);
    path.close();
    return path;
  }

  @override
  bool shouldReclip(CustomClipper<Path> oldClipper) => false;
}

/// The "organic wave" header used across most screens in the new design
/// system — a Secondary Slate (or Primary) block with a curved bottom edge.
class WaveHeader extends StatelessWidget {
  final String title;
  final VoidCallback? onBack;
  final Widget? trailing;
  final Color background;
  final double height;

  const WaveHeader({
    super.key,
    required this.title,
    this.onBack,
    this.trailing,
    this.background = AppColors.onPrimaryFixed,
    this.height = 120,
  });

  @override
  Widget build(BuildContext context) {
    return ClipPath(
      clipper: _WaveClipper(),
      child: Container(
        width: double.infinity,
        height: height,
        color: background,
        padding: const EdgeInsets.fromLTRB(4, 8, 16, 32),
        child: Row(
          children: [
            if (onBack != null)
              IconButton(
                onPressed: onBack,
                icon: const Icon(Icons.arrow_back, color: Colors.white),
              )
            else
              const SizedBox(width: 48),
            Expanded(
              child: Text(
                title,
                textAlign: TextAlign.center,
                style: AppTextStyles.headlineSm.copyWith(color: Colors.white),
              ),
            ),
            trailing ?? const SizedBox(width: 48),
          ],
        ),
      ),
    );
  }
}
