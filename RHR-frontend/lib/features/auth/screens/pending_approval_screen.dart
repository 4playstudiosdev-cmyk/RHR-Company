import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../shared/widgets/wave_header.dart';

class PendingApprovalScreen extends StatelessWidget {
  const PendingApprovalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surfaceContainerLowest,
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            const WaveHeader(title: 'RHR & Company', background: AppColors.primary),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.marginMobile, vertical: AppSpacing.lg),
                child: Column(
                  children: [
                    Container(
                      width: 160, height: 160,
                      decoration: BoxDecoration(
                        color: AppColors.tertiaryFixed.withValues(alpha: 0.25),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.hourglass_top_rounded, size: 76, color: AppColors.primary),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Text('Account Under Review',
                        textAlign: TextAlign.center,
                        style: AppTextStyles.headlineLgMobile.copyWith(color: AppColors.primary)),
                    const SizedBox(height: AppSpacing.xs),
                    Text('Our admin team will activate your account within 24 hours',
                        textAlign: TextAlign.center,
                        style: AppTextStyles.bodyMd.copyWith(color: AppColors.outline)),
                    const SizedBox(height: AppSpacing.lg),

                    // Contact card
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(AppSpacing.md),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainerLowest,
                        borderRadius: BorderRadius.circular(AppRadius.base),
                        border: Border.all(color: AppColors.outlineVariant),
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
                      ),
                      child: Stack(children: [
                        Positioned(
                          left: 0, top: 0, bottom: 0,
                          child: Container(width: 4, color: AppColors.primary),
                        ),
                        Padding(
                          padding: const EdgeInsets.only(left: AppSpacing.sm),
                          child: Column(children: [
                            _ContactRow(icon: Icons.call, label: 'Phone Support', value: '+92-332-211069'),
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: AppSpacing.xs),
                              child: Divider(color: AppColors.outlineVariant, height: 1),
                            ),
                            _ContactRow(icon: Icons.mail, label: 'Email Support', value: 'rhr@company.com'),
                          ]),
                        ),
                      ]),
                    ),
                    const SizedBox(height: AppSpacing.lg),

                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () => context.go('/login'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.primary,
                          side: const BorderSide(color: AppColors.primary, width: 2),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                        ),
                        icon: const Icon(Icons.logout),
                        label: Text('Logout', style: AppTextStyles.labelMd.copyWith(color: AppColors.primary)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ContactRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _ContactRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Container(
        width: 40, height: 40,
        decoration: const BoxDecoration(color: AppColors.surfaceContainer, shape: BoxShape.circle),
        child: Icon(icon, color: AppColors.primary, size: 20),
      ),
      const SizedBox(width: AppSpacing.sm),
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: AppTextStyles.labelMd.copyWith(color: AppColors.outline)),
        Text(value, style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurface, fontWeight: FontWeight.w600)),
      ]),
    ]);
  }
}
