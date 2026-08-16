import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/staggered_fade_in.dart';

class PendingApprovalScreen extends StatelessWidget {
  const PendingApprovalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              StaggeredFadeIn(
                index: 0,
                scale: true,
                child: Container(
                  width: 110, height: 110,
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF3E0),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: AppColors.orange, width: 3),
                  ),
                  child: const Icon(Icons.hourglass_empty_rounded, size: 55, color: AppColors.orange),
                ),
              ),
              const SizedBox(height: 32),
              const Text('Account Pending',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: AppColors.navy)),
              const SizedBox(height: 12),
              const Text(
                'Your account has been submitted for review. Our team will approve your access shortly.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: AppColors.steelBlue, height: 1.6)),
              const SizedBox(height: 8),
              Container(width: 60, height: 3,
                decoration: BoxDecoration(color: AppColors.orange, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 48),
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppColors.white, borderRadius: BorderRadius.circular(20),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 16, offset: const Offset(0, 4))],
                ),
                child: Column(
                  children: [
                    StaggeredFadeIn(index: 1, child: _step('1', 'Phone verified via OTP', true)),
                    StaggeredFadeIn(index: 2, child: _step('2', 'Admin reviews your account', false)),
                    StaggeredFadeIn(index: 3, child: _step('3', 'Account activated — get started!', false)),
                  ],
                ),
              ),
              const SizedBox(height: 32),
              StaggeredFadeIn(
                index: 4,
                child: RHRButton(
                  text: 'Check Status',
                  onPressed: () => context.go('/home'),
                ),
              ),
              const SizedBox(height: 16),
              GestureDetector(
                onTap: () => context.go('/login'),
                child: const Text('Back to Login',
                  style: TextStyle(color: AppColors.steelBlue, fontSize: 13)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _step(String number, String text, bool done) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(
              color: done ? AppColors.success : AppColors.orange,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: done
                ? const Icon(Icons.check, color: Colors.white, size: 16)
                : Text(number, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Text(text,
              style: TextStyle(
                fontSize: 14,
                color: done ? AppColors.success : AppColors.navy,
                fontWeight: done ? FontWeight.w600 : FontWeight.normal)),
          ),
        ],
      ),
    );
  }
}
