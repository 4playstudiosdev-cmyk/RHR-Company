import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

class RHRInputField extends StatelessWidget {
  final String label;
  final String? hint;
  final TextEditingController? controller;
  final TextInputType keyboardType;
  final bool obscureText;
  final String? prefixText;
  final Widget? suffixIcon;

  const RHRInputField({
    super.key,
    required this.label,
    this.hint,
    this.controller,
    this.keyboardType = TextInputType.text,
    this.obscureText = false,
    this.prefixText,
    this.suffixIcon,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      obscureText: obscureText,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixText: prefixText,
        suffixIcon: suffixIcon,
        labelStyle: const TextStyle(color: AppColors.navy),
        enabledBorder: const UnderlineInputBorder(
          borderSide: BorderSide(color: AppColors.navy),
        ),
        focusedBorder: const UnderlineInputBorder(
          borderSide: BorderSide(color: AppColors.orange, width: 2),
        ),
      ),
    );
  }
}