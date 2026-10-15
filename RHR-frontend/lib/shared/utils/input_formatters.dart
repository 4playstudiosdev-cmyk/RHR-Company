import 'package:flutter/services.dart';

/// Auto-formats a CNIC as the user types: 5 digits, dash, 7 digits, dash,
/// 1 digit — e.g. "4220127036001" becomes "42201-2703600-1". Caps at 13
/// digits total (the real CNIC length). Handles backspace specially: a
/// single delete right after an auto-inserted dash removes the digit
/// before it too, instead of visually doing nothing (the formatter would
/// otherwise just re-insert the same dash).
class CnicInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final oldDigits = oldValue.text.replaceAll(RegExp(r'\D'), '');
    var digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final isDeletion = newValue.text.length < oldValue.text.length;
    if (isDeletion && digits.length == oldDigits.length && digits.isNotEmpty) {
      digits = digits.substring(0, digits.length - 1);
    }
    if (digits.length > 13) digits = digits.substring(0, 13);

    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      buffer.write(digits[i]);
      if (i == 4 || i == 11) buffer.write('-');
    }
    final text = buffer.toString();
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

/// Auto-formats a 10-digit local Pakistani mobile number (the part after
/// +92) as the user types: 3 digits, space, 7 digits — e.g. "3102110584"
/// becomes "310 2110584". Pair with `InputDecoration(prefixText: '+92 ')`
/// so the field reads "+92 310 2110584" without the user being able to
/// edit/delete the country code. Same backspace-at-separator handling as
/// [CnicInputFormatter].
class PhoneLocalInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final oldDigits = oldValue.text.replaceAll(RegExp(r'\D'), '');
    var digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final isDeletion = newValue.text.length < oldValue.text.length;
    if (isDeletion && digits.length == oldDigits.length && digits.isNotEmpty) {
      digits = digits.substring(0, digits.length - 1);
    }
    if (digits.length > 10) digits = digits.substring(0, 10);

    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      buffer.write(digits[i]);
      if (i == 2) buffer.write(' ');
    }
    final text = buffer.toString();
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

/// Formats a raw 10-digit local number string the same way
/// [PhoneLocalInputFormatter] does, for pre-filling a controller from
/// data already loaded from the backend (not live typing).
String formatLocalPhone(String digits) {
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length && i < 10; i++) {
    buffer.write(digits[i]);
    if (i == 2) buffer.write(' ');
  }
  return buffer.toString();
}

/// Strips a stored phone value (which may be "+923102110584",
/// "03102110584", or already "310 2110584") down to just the 10 local
/// digits, so it can be re-grouped for display regardless of how it was
/// saved previously.
String localPhoneDigits(String? raw) {
  if (raw == null) return '';
  var digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.startsWith('92')) {
    digits = digits.substring(2);
  } else if (digits.startsWith('0')) digits = digits.substring(1);
  if (digits.length > 10) digits = digits.substring(digits.length - 10);
  return digits;
}
