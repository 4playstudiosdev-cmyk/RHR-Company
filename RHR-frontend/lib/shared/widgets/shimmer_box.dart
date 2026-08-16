import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

/// A single shimmering placeholder block, used to build skeleton loaders.
class ShimmerBox extends StatefulWidget {
  final double? width;
  final double height;
  final BorderRadius borderRadius;

  const ShimmerBox({
    super.key,
    this.width,
    this.height = 16,
    this.borderRadius = const BorderRadius.all(Radius.circular(8)),
  });

  @override
  State<ShimmerBox> createState() => _ShimmerBoxState();
}

class _ShimmerBoxState extends State<ShimmerBox> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))
      ..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (rect) {
            final dx = _controller.value * 2 - 1;
            return LinearGradient(
              colors: [
                AppColors.warmGrey,
                Colors.white,
                AppColors.warmGrey,
              ],
              stops: const [0.35, 0.5, 0.65],
              begin: Alignment(dx - 1, 0),
              end: Alignment(dx + 1, 0),
            ).createShader(rect);
          },
          child: Container(
            width: widget.width,
            height: widget.height,
            decoration: BoxDecoration(
              color: AppColors.warmGrey,
              borderRadius: widget.borderRadius,
            ),
          ),
        );
      },
    );
  }
}

/// Skeleton for a single product card in the catalogue grid.
class ShimmerProductCard extends StatelessWidget {
  const ShimmerProductCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ShimmerBox(
            height: 110,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const ShimmerBox(height: 12, width: 90),
                const SizedBox(height: 8),
                const ShimmerBox(height: 10, width: 50),
                const SizedBox(height: 10),
                ShimmerBox(height: 30, borderRadius: BorderRadius.circular(8)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Skeleton for a single list row (customers, orders, notifications, etc.)
class ShimmerListRow extends StatelessWidget {
  const ShimmerListRow({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(children: [
        const ShimmerBox(width: 44, height: 44, borderRadius: BorderRadius.all(Radius.circular(22))),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const ShimmerBox(height: 13, width: 140),
            const SizedBox(height: 8),
            const ShimmerBox(height: 11, width: 90),
          ]),
        ),
      ]),
    );
  }
}
