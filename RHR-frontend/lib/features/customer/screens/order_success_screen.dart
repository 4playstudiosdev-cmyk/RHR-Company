import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';

/// Shown right after a successful checkout. Reads whatever
/// order_placement_screen.dart handed off via `extra` — orderId is the
/// only field actually needed for "Track My Order"; itemCount/total are
/// cosmetic and degrade gracefully if absent.
class OrderSuccessScreen extends StatelessWidget {
  final dynamic extra;
  const OrderSuccessScreen({super.key, this.extra});

  Map get _data => extra is Map ? extra as Map : {};

  @override
  Widget build(BuildContext context) {
    final orderId = _data['orderId']?.toString();
    final itemCount = _data['itemCount'] ?? 0;
    final total = _data['total'] ?? 0;
    final shortId = orderId != null && orderId.length >= 8
        ? orderId.substring(0, 8).toUpperCase()
        : (orderId ?? '');

    return Scaffold(
      backgroundColor: AppColors.surfaceContainerLowest,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.marginMobile),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 128, height: 128,
                  decoration: BoxDecoration(
                    color: AppColors.success.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.success.withValues(alpha: 0.2), width: 4),
                  ),
                  child: const Icon(Icons.check, size: 56, color: AppColors.success),
                ),
                const SizedBox(height: AppSpacing.md),
                Text('Order Placed!', style: AppTextStyles.headlineXl.copyWith(color: AppColors.onPrimaryFixed, fontSize: 28)),
                const SizedBox(height: 4),
                Text('Your order is being prepared.', style: AppTextStyles.bodyLg.copyWith(color: AppColors.outline)),
                const SizedBox(height: AppSpacing.base),
                if (shortId.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceContainerHigh,
                      borderRadius: BorderRadius.circular(AppRadius.full),
                      border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
                    ),
                    child: Text('#ORD-$shortId', style: AppTextStyles.labelMd.copyWith(color: AppColors.primary)),
                  ),
                const SizedBox(height: AppSpacing.md),

                // Summary card
                Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLowest,
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                    border: Border.all(color: AppColors.outlineVariant),
                  ),
                  child: Stack(children: [
                    Positioned(left: 0, top: 0, bottom: 0, child: Container(width: 4, color: AppColors.success)),
                    Padding(
                      padding: const EdgeInsets.only(left: AppSpacing.sm, top: AppSpacing.sm, bottom: AppSpacing.sm, right: AppSpacing.sm),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _SummaryItem(label: 'Order Summary', value: '$itemCount items'),
                          Container(width: 1, height: 32, color: AppColors.outlineVariant),
                          _SummaryItem(label: 'Total Amount', value: 'PKR $total', valueColor: AppColors.primary),
                        ],
                      ),
                    ),
                  ]),
                ),
                const SizedBox(height: AppSpacing.md),

                Row(children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: orderId == null ? null : () => context.go('/order-tracking', extra: orderId),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                      ),
                      icon: const Icon(Icons.my_location, size: 18),
                      label: Text('Track Order', style: AppTextStyles.labelMd.copyWith(color: Colors.white)),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.base),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => context.go('/catalogue'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primary,
                        side: const BorderSide(color: AppColors.primary, width: 2),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                      ),
                      child: Text('Continue Shopping', style: AppTextStyles.labelMd.copyWith(color: AppColors.primary)),
                    ),
                  ),
                ]),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SummaryItem extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const _SummaryItem({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Text(label, style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
      const SizedBox(height: 2),
      Text(value, style: AppTextStyles.headlineSm.copyWith(color: valueColor ?? AppColors.onSurface)),
    ]);
  }
}
