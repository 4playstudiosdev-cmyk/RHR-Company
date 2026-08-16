import 'package:flutter/material.dart';

/// Wraps [child] with a fade + slide-up (or fade + scale, via [scale])
/// entrance animation. Pass the item's position via [index] to stagger a
/// list/grid on load.
class StaggeredFadeIn extends StatefulWidget {
  final Widget child;
  final int index;
  final Duration baseDelay;
  final Duration duration;
  final bool scale;

  const StaggeredFadeIn({
    super.key,
    required this.child,
    this.index = 0,
    this.baseDelay = const Duration(milliseconds: 40),
    this.duration = const Duration(milliseconds: 350),
    this.scale = false,
  });

  @override
  State<StaggeredFadeIn> createState() => _StaggeredFadeInState();
}

class _StaggeredFadeInState extends State<StaggeredFadeIn> {
  bool _visible = false;

  @override
  void initState() {
    super.initState();
    final steps = widget.index.clamp(0, 12);
    Future.delayed(widget.baseDelay * steps, () {
      if (mounted) setState(() => _visible = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final faded = AnimatedOpacity(
      opacity: _visible ? 1 : 0,
      duration: widget.duration,
      curve: Curves.easeOut,
      child: widget.child,
    );

    if (widget.scale) {
      return AnimatedScale(
        scale: _visible ? 1 : 0.9,
        duration: widget.duration,
        curve: Curves.easeOutCubic,
        child: faded,
      );
    }

    return AnimatedSlide(
      offset: _visible ? Offset.zero : const Offset(0, 0.08),
      duration: widget.duration,
      curve: Curves.easeOutCubic,
      child: faded,
    );
  }
}
