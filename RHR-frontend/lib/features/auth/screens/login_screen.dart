import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../core/utils/phone_normalizer.dart';
import '../../../services/gps_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  void _sendOtp() async {
    if (_phoneController.text.isEmpty) return;
    setState(() => _isLoading = true);

    final phone = PhoneNormalizer.normalize(_phoneController.text);

    try {
      final response = await DioClient.instance.post(
        ApiEndpoints.sendOtp,
        data: {'phone': phone},
      );
      // ignore: avoid_print
      print('=== SEND OTP RESPONSE ===');
      // ignore: avoid_print
      print(response.data);

      if (response.data['success'] == true) {
        final isNewUser = response.data['data']?['isNewUser'] == true;
        if (mounted) {
          if (isNewUser) {
            context.go('/signup', extra: phone);
          } else {
            context.go('/otp', extra: phone);
          }
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(response.data['message'] ?? 'Please try again.')));
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Server error. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ⚠️ TEMP — GUEST TESTING LOGIN. Remove this whole block + its buttons
  // before the real production launch. Logs in as a fixed demo account
  // (one per role) via a matching fixed-phone/fixed-OTP bypass on the
  // backend (see RHR-backend/src/services/otp.service.js's GUEST_ACCOUNTS
  // map) — goes through the real /verify-otp endpoint and gets a real
  // token, so the rest of the app behaves exactly like a normal login.
  String? _guestLoadingRole;

  static const _guestCredentials = {
    'customer': {'phone': '03000000000', 'otp': '999999'},
    'salesman': {'phone': '03000000001', 'otp': '999998'},
    'driver':   {'phone': '03000000002', 'otp': '999997'},
  };

  void _continueAsGuest(String role) async {
    setState(() => _guestLoadingRole = role);
    try {
      final creds = _guestCredentials[role]!;
      final response = await DioClient.instance.post(ApiEndpoints.verifyOtp, data: {
        'phone': creds['phone'],
        'otp': creds['otp'],
        'companyId': ApiEndpoints.khiId,
      });
      if (response.data['success'] == true) {
        final data = response.data['data'];
        if (data != null && data['token'] != null) {
          await SecureStorage.saveToken(data['token']);
          final loggedInRole = data['user']?['role'] ?? 'customer';
          await SecureStorage.saveRole(loggedInRole);
          await SecureStorage.savePhone(creds['phone']!);
          final name = data['user']?['fullName'] as String?;
          if (name != null && name.isNotEmpty) await SecureStorage.saveFullName(name);
          if (data['user']?['id'] != null) await SecureStorage.saveUserId(data['user']['id'] as String);
          final carNumber = data['user']?['carNumber'] as String?;
          if (carNumber != null && carNumber.isNotEmpty) await SecureStorage.saveCarNumber(carNumber);
          if (loggedInRole == 'salesman') {
            await GPSService().startTracking();
            if (mounted) context.go('/salesman-dashboard');
          } else if (loggedInRole == 'driver') {
            await GPSService().startTracking();
            if (mounted) context.go('/driver-dashboard');
          } else {
            if (mounted) context.go('/home');
          }
          return;
        }
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(response.data['message'] ?? 'Guest login failed')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Guest login error: $e')));
      }
    } finally {
      if (mounted) setState(() => _guestLoadingRole = null);
    }
  }

  Widget _guestButton(String role, String label, IconData icon) {
    final isLoading = _guestLoadingRole == role;
    return OutlinedButton(
      onPressed: _guestLoadingRole != null ? null : () => _continueAsGuest(role),
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.tertiaryContainer,
        side: BorderSide(color: AppColors.tertiaryContainer.withValues(alpha: 0.6)),
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
      ),
      child: isLoading
          ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
          : Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(icon, size: 16),
              const SizedBox(height: 2),
              Text(label, style: AppTextStyles.bodySm.copyWith(color: AppColors.tertiaryContainer, fontSize: 11)),
            ]),
    );
  }

  static const _darkNavy = Color(0xFF00174B);
  static const _buttonBlue = Color(0xFF073C9F);
  static const _borderGrey = Color(0xFFCED4DA);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: IntrinsicHeight(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.marginMobile),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 24),
                          child: Column(
                            children: [
                              Image.asset(
                                'assets/images/rhr-logo.jpeg',
                                width: 140,
                                height: 140,
                                fit: BoxFit.contain,
                              ),
                              const SizedBox(height: AppSpacing.md),
                              Text(
                                'Welcome Back',
                                textAlign: TextAlign.center,
                                style: AppTextStyles.headlineLgMobile.copyWith(color: _darkNavy),
                              ),
                              const SizedBox(height: AppSpacing.base),
                              Text(
                                'Enter phone number to continue',
                                textAlign: TextAlign.center,
                                style: AppTextStyles.bodyMd.copyWith(color: _darkNavy),
                              ),
                              const SizedBox(height: AppSpacing.md),

                              // Phone input
                              Container(
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  border: Border.all(color: _borderGrey),
                                  borderRadius: BorderRadius.circular(AppRadius.base),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                                      decoration: const BoxDecoration(
                                        border: Border(right: BorderSide(color: _borderGrey)),
                                      ),
                                      child: Text('🇵🇰  +92', style: AppTextStyles.bodyMd.copyWith(color: _darkNavy)),
                                    ),
                                    Expanded(
                                      child: TextField(
                                        controller: _phoneController,
                                        keyboardType: TextInputType.phone,
                                        style: AppTextStyles.bodyMd.copyWith(color: _darkNavy),
                                        decoration: InputDecoration(
                                          hintText: '300 1234567',
                                          hintStyle: AppTextStyles.bodyMd.copyWith(color: AppColors.outline),
                                          border: InputBorder.none,
                                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: AppSpacing.md),

                              // Send OTP button
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton(
                                  onPressed: _isLoading ? null : _sendOtp,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: _buttonBlue,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                                    elevation: 1,
                                  ),
                                  child: _isLoading
                                      ? const SizedBox(
                                          width: 22, height: 22,
                                          child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                                        )
                                      : Text('Send OTP', style: AppTextStyles.headlineSm.copyWith(color: Colors.white)),
                                ),
                              ),
                              const SizedBox(height: AppSpacing.md),

                              // Divider
                              Row(
                                children: [
                                  const Expanded(child: Divider(color: AppColors.outlineVariant)),
                                  Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 16),
                                    child: Text('OR', style: AppTextStyles.bodySm.copyWith(color: _darkNavy, letterSpacing: 1.2)),
                                  ),
                                  const Expanded(child: Divider(color: AppColors.outlineVariant)),
                                ],
                              ),
                              const SizedBox(height: AppSpacing.md),

                              GestureDetector(
                                onTap: () => context.go('/signup'),
                                child: Text.rich(
                                  TextSpan(
                                    text: 'New Customer? ',
                                    style: AppTextStyles.bodyMd.copyWith(color: _darkNavy, fontWeight: FontWeight.w600),
                                    children: [
                                      TextSpan(
                                        text: 'Register here',
                                        style: AppTextStyles.bodyMd.copyWith(color: _buttonBlue, fontWeight: FontWeight.w600),
                                      ),
                                    ],
                                  ),
                                ),
                              ),

                              // ⚠️ TEMP — remove before production launch (see
                              // _continueAsGuest above for why this is safe/removable).
                              const SizedBox(height: AppSpacing.md),
                              Text('Guest login (testing only)',
                                  style: AppTextStyles.bodySm.copyWith(color: AppColors.outline, letterSpacing: 0.5)),
                              const SizedBox(height: AppSpacing.sm),
                              Row(children: [
                                Expanded(child: _guestButton('customer', 'Customer', Icons.storefront_outlined)),
                                const SizedBox(width: 8),
                                Expanded(child: _guestButton('salesman', 'Salesman', Icons.handshake_outlined)),
                                const SizedBox(width: 8),
                                Expanded(child: _guestButton('driver', 'Driver', Icons.local_shipping_outlined)),
                              ]),
                            ],
                          ),
                        ),
                        const Spacer(),
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 24),
                          child: Text(
                            'Karachi · Hyderabad · Sukkur',
                            style: AppTextStyles.bodySm.copyWith(color: AppColors.outline, letterSpacing: 1.2),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
