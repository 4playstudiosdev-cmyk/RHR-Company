import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

/// True when the server refused a new order because this customer already has
/// one in progress (pending → dispatched). Shown as a popup, not a snackbar.
bool isOrderInLine(DioException e) => isOrderInLineData(e.response?.data);

/// Same check on a response body — the app's Dio treats 4xx as a normal
/// response (validateStatus < 500), so a rejected order arrives here, not as
/// a DioException.
bool isOrderInLineData(dynamic data) {
  if (data is! Map) return false;
  if (data['code'] == 'ORDER_IN_LINE') return true;
  return (data['message'] ?? '').toString().toLowerCase().contains('already one order in line');
}

Future<void> showOrderInLineDialog(BuildContext context, {bool forCustomer = true}) {
  return showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      icon: const Icon(Icons.hourglass_top_rounded, color: AppColors.orange, size: 44),
      title: const Text('Already one order in line',
          textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
      content: Text(
        forCustomer
            ? 'You already have an order in progress. You can place a new one once it has been delivered.\n\nAap ka ek order pehle se process mein hai. Delivery ke baad naya order de sakte hain.'
            : 'This customer already has an order in progress. A new one can be placed once it has been delivered.\n\nIs customer ka ek order pehle se process mein hai. Delivery ke baad naya order ho sakta hai.',
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 13.5, height: 1.4),
      ),
      actionsAlignment: MainAxisAlignment.center,
      actions: [
        FilledButton(
          onPressed: () => Navigator.of(ctx).pop(),
          style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
          child: const Text('OK'),
        ),
      ],
    ),
  );
}
