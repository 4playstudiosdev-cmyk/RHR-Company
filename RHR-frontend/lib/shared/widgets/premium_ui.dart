import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show TextInputFormatter;

// ─── RHR Connect enterprise design tokens ───────────────────────────────────
const kNavy      = Color(0xFF00185D);
const kNavyDark  = Color(0xFF000D3A);
const kNavyLight = Color(0xFF0A2472);
const kGreen     = Color(0xFF00C853);
const kRed       = Color(0xFFFF3B30);
const kAmber     = Color(0xFFFFA726);
const kCardBg    = Color(0xFFF5F7FA);
const kCardWhite = Colors.white;
const kTextMuted = Color(0xFF8A93A8);

// ─── Premium AppBar ──────────────────────────────────────────────────────────
PreferredSizeWidget premiumAppBar(
  String title, {
  VoidCallback? onBack,
  List<Widget>? actions,
  Widget? bottom,
  double bottomHeight = 56,
  String? subtitle,
}) {
  return PreferredSize(
    preferredSize: Size.fromHeight(bottom != null ? 56 + bottomHeight : 56),
    child: Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [kNavyDark, kNavyLight],
        ),
      ),
      child: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: onBack != null
            ? IconButton(
                icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
                onPressed: onBack,
              )
            : null,
        title: subtitle != null
            ? Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16)),
                Text(subtitle, style: const TextStyle(color: Colors.white54, fontSize: 11)),
              ])
            : Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 17)),
        actions: actions,
        bottom: bottom != null
            ? PreferredSize(preferredSize: Size.fromHeight(bottomHeight), child: bottom)
            : null,
      ),
    ),
  );
}

// ─── Premium summary card (navy gradient) ────────────────────────────────────
class PremiumSummaryCard extends StatelessWidget {
  final String label;
  final String value;
  final String? sublabel;
  final IconData? icon;
  final Color? valueColor;
  final List<Widget>? children;

  const PremiumSummaryCard({
    super.key,
    required this.label,
    required this.value,
    this.sublabel,
    this.icon,
    this.valueColor,
    this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [kNavy, Color(0xFF1A3A8F)],
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: kNavy.withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: children != null
          ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: children!)
          : Column(children: [
              if (icon != null) Icon(icon, color: Colors.white60, size: 28),
              if (icon != null) const SizedBox(height: 8),
              Text(label, style: const TextStyle(color: Colors.white60, fontSize: 13)),
              const SizedBox(height: 6),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(value,
                    style: TextStyle(
                        color: valueColor ?? Colors.white,
                        fontSize: 30,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5)),
              ),
              if (sublabel != null) ...[
                const SizedBox(height: 4),
                Text(sublabel!, style: const TextStyle(color: Colors.white54, fontSize: 11)),
              ],
            ]),
    );
  }
}

// ─── Premium list card ────────────────────────────────────────────────────────
class PremiumCard extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry? margin;
  final EdgeInsetsGeometry? padding;
  final Color? borderColor;

  const PremiumCard({
    super.key,
    required this.child,
    this.onTap,
    this.margin,
    this.padding,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: margin ?? const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
        padding: padding ?? const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: kCardWhite,
          borderRadius: BorderRadius.circular(14),
          border: borderColor != null ? Border.all(color: borderColor!, width: 1.5) : null,
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: child,
      ),
    );
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────
class StatusBadge extends StatelessWidget {
  final String label;
  final Color color;

  const StatusBadge(this.label, this.color, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(20)),
      child: Text(label.toUpperCase(),
          style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.4)),
    );
  }
}

// ─── Icon tile (for quick actions etc.) ──────────────────────────────────────
class IconTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const IconTile({super.key, required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
        decoration: BoxDecoration(
          color: kCardWhite,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: color, size: 22),
          ),
          const SizedBox(height: 8),
          Text(label,
              textAlign: TextAlign.center,
              maxLines: 2,
              style: const TextStyle(color: kNavy, fontSize: 10, fontWeight: FontWeight.w700, height: 1.2)),
        ]),
      ),
    );
  }
}

// ─── Empty state ──────────────────────────────────────────────────────────────
class PremiumEmpty extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;

  const PremiumEmpty({super.key, required this.icon, required this.title, this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 72, height: 72,
            decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.06), shape: BoxShape.circle),
            child: Icon(icon, size: 34, color: kNavy.withValues(alpha: 0.3)),
          ),
          const SizedBox(height: 16),
          Text(title,
              textAlign: TextAlign.center,
              style: const TextStyle(color: kNavy, fontSize: 15, fontWeight: FontWeight.w600)),
          if (subtitle != null) ...[
            const SizedBox(height: 6),
            Text(subtitle!, textAlign: TextAlign.center, style: const TextStyle(color: kTextMuted, fontSize: 13)),
          ],
        ]),
      ),
    );
  }
}

// ─── Section header ───────────────────────────────────────────────────────────
class SectionHeader extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  const SectionHeader({super.key, required this.title, this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(children: [
        Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: kNavy, letterSpacing: -0.2)),
        const Spacer(),
        if (actionLabel != null && onAction != null)
          GestureDetector(
            onTap: onAction,
            child: Row(children: [
              Text(actionLabel!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: kNavy)),
              const Icon(Icons.chevron_right_rounded, size: 16, color: kNavy),
            ]),
          ),
      ]),
    );
  }
}

// ─── Input field (premium style) ─────────────────────────────────────────────
class PremiumInput extends StatelessWidget {
  final String label;
  final String? hint;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  final String? prefixText;
  final IconData? prefixIcon;
  final bool obscureText;
  final Widget? suffix;
  final List<TextInputFormatter>? inputFormatters;

  const PremiumInput({
    super.key,
    required this.label,
    this.hint,
    required this.controller,
    this.keyboardType,
    this.prefixText,
    this.prefixIcon,
    this.obscureText = false,
    this.suffix,
    this.inputFormatters,
  });

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(color: kNavy, fontSize: 13, fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      TextField(
        controller: controller,
        keyboardType: keyboardType,
        obscureText: obscureText,
        inputFormatters: inputFormatters,
        style: const TextStyle(color: kNavy, fontSize: 14),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: kTextMuted, fontSize: 14),
          prefixText: prefixText,
          prefixStyle: const TextStyle(color: kNavy, fontWeight: FontWeight.w600),
          prefixIcon: prefixIcon != null ? Icon(prefixIcon, color: kTextMuted, size: 18) : null,
          suffixIcon: suffix,
          filled: true,
          fillColor: kCardBg,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFE0E5EF)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFE0E5EF)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: kNavy, width: 1.5),
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        ),
      ),
    ]);
  }
}

// ─── Premium button ───────────────────────────────────────────────────────────
class PremiumButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool isSecondary;
  final IconData? icon;
  final Color? color;

  const PremiumButton({
    super.key,
    required this.text,
    this.onPressed,
    this.isLoading = false,
    this.isSecondary = false,
    this.icon,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final bg = isSecondary ? Colors.transparent : (color ?? kNavy);
    final fg = isSecondary ? kNavy : Colors.white;
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: bg,
          foregroundColor: fg,
          elevation: isSecondary ? 0 : 0,
          side: isSecondary ? const BorderSide(color: kNavy) : null,
          padding: const EdgeInsets.symmetric(vertical: 15),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: isLoading
            ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: fg))
            : Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
                Text(text, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 15)),
              ]),
      ),
    );
  }
}

// ─── Search bar ───────────────────────────────────────────────────────────────
class PremiumSearchBar extends StatelessWidget {
  final String hint;
  final ValueChanged<String> onChanged;
  final EdgeInsetsGeometry? margin;

  const PremiumSearchBar({super.key, required this.hint, required this.onChanged, this.margin});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin ?? const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: kCardWhite,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: TextField(
        onChanged: onChanged,
        style: const TextStyle(color: kNavy, fontSize: 14),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: kTextMuted, fontSize: 13),
          prefixIcon: const Icon(Icons.search_rounded, color: kTextMuted, size: 20),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        ),
      ),
    );
  }
}
