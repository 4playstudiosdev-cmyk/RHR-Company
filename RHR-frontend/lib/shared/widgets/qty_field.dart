import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// A quantity the user can either step with the − / + buttons next to it or
/// simply type. Digits only.
///
/// While typing, a positive number is applied straight away (so totals update
/// live); an empty box or 0 is only applied when typing is finished (keyboard
/// "done" or the field loses focus) — otherwise clearing the box to retype a
/// number would drop the item mid-edit. The parent decides what 0 means
/// (remove from cart, clamp to 1...) and passes the resulting [value] back.
class QtyField extends StatefulWidget {
  final int value;
  final ValueChanged<int> onChanged;
  final double width;
  final TextStyle? style;
  final Color? borderColor;

  const QtyField({
    super.key,
    required this.value,
    required this.onChanged,
    this.width = 48,
    this.style,
    this.borderColor,
  });

  @override
  State<QtyField> createState() => _QtyFieldState();
}

class _QtyFieldState extends State<QtyField> {
  late final TextEditingController _controller = TextEditingController(text: '${widget.value}');
  late final FocusNode _focus = FocusNode()..addListener(_onFocusChange);

  @override
  void didUpdateWidget(QtyField old) {
    super.didUpdateWidget(old);
    // Keep the box in step with the − / + buttons (and the parent's clamping),
    // but never fight the user while they are typing.
    if (!_focus.hasFocus && _controller.text != '${widget.value}') {
      _controller.text = '${widget.value}';
    }
  }

  void _onFocusChange() {
    if (!_focus.hasFocus) _commit();
  }

  void _commit() {
    final n = int.tryParse(_controller.text.trim()) ?? 0;
    widget.onChanged(n);
    // If the parent kept the old value (e.g. it ignored 0) show that one.
    if (mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !_focus.hasFocus) _controller.text = '${widget.value}';
      });
    }
  }

  @override
  void dispose() {
    _focus.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.width,
      child: TextField(
        controller: _controller,
        focusNode: _focus,
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
        style: widget.style ?? const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
        onChanged: (text) {
          final n = int.tryParse(text.trim());
          if (n != null && n > 0) widget.onChanged(n);
        },
        onSubmitted: (_) => _commit(),
        decoration: InputDecoration(
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
          enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: widget.borderColor ?? Colors.black26)),
          focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: widget.borderColor ?? Colors.black54, width: 2)),
        ),
      ),
    );
  }
}
