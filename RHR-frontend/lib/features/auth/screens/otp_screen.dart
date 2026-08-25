import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../core/utils/phone_normalizer.dart';
import '../../../services/gps_service.dart';

class OtpScreen extends StatefulWidget {
  final dynamic extra;
  const OtpScreen({super.key, this.extra});

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final List<TextEditingController> _controllers =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _focusNodes =
      List.generate(6, (_) => FocusNode());
  bool _isLoading = false;
  bool _isResending = false;
  int _resendSeconds = 45;
  Timer? _resendTimer;

  @override
  void initState() {
    super.initState();
    _startResendTimer();
  }

  void _startResendTimer() {
    _resendSeconds = 45;
    _resendTimer?.cancel();
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      if (_resendSeconds <= 1) {
        t.cancel();
        setState(() => _resendSeconds = 0);
      } else {
        setState(() => _resendSeconds--);
      }
    });
  }

  @override
  void dispose() {
    _resendTimer?.cancel();
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  String get _phone {
    if (widget.extra is String) return widget.extra as String;
    if (widget.extra is Map) return (widget.extra as Map)['phone'] ?? '';
    return '';
  }

  String? get _fullName {
    if (widget.extra is Map) return (widget.extra as Map)['fullName'] as String?;
    return null;
  }

  String? get _companyId {
    if (widget.extra is Map) return (widget.extra as Map)['companyId'] as String?;
    return null;
  }

  String? get _role {
    if (widget.extra is Map) return (widget.extra as Map)['role'] as String?;
    return null;
  }

  String? get _businessName {
    if (widget.extra is Map) return (widget.extra as Map)['businessName'] as String?;
    return null;
  }

  String? get _address {
    if (widget.extra is Map) return (widget.extra as Map)['address'] as String?;
    return null;
  }

  String? get _position {
    if (widget.extra is Map) return (widget.extra as Map)['position'] as String?;
    return null;
  }

  String? get _carNumber {
    if (widget.extra is Map) return (widget.extra as Map)['carNumber'] as String?;
    return null;
  }

  void _onChanged(String value, int index) {
    if (value.isNotEmpty && index < 5) _focusNodes[index + 1].requestFocus();
    if (value.isEmpty && index > 0) _focusNodes[index - 1].requestFocus();
  }

  Future<void> _resendOtp() async {
    if (_resendSeconds > 0 || _isResending) return;
    setState(() => _isResending = true);
    try {
      final phone = PhoneNormalizer.normalize(_phone);
      await DioClient.instance.post(ApiEndpoints.sendOtp, data: {'phone': phone});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('OTP resent')));
        _startResendTimer();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not resend OTP')));
      }
    } finally {
      if (mounted) setState(() => _isResending = false);
    }
  }

  void _verifyOtp() async {
    final otp = _controllers.map((c) => c.text).join();
    if (otp.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Enter all 6 digits')));
      return;
    }
    setState(() => _isLoading = true);
    final phone = PhoneNormalizer.normalize(_phone);
    final Map<String, dynamic> body = {
      'phone':     phone,
      'otp':       otp,
      'companyId': _companyId ?? ApiEndpoints.khiId,
    };
    if (_fullName != null) body['fullName'] = _fullName!;
    if (_businessName != null && _businessName!.isNotEmpty) body['shopName'] = _businessName;
    if (_address != null && _address!.isNotEmpty) body['shopAddress'] = _address;
    if (_role != null) body['role'] = _role!;
    if (_position != null && _position!.isNotEmpty) body['position'] = _position!;
    if (_carNumber != null && _carNumber!.isNotEmpty) body['carNumber'] = _carNumber!;
    debugPrint('Verify OTP body: $body');
    try {
      final response = await DioClient.instance.post(
          ApiEndpoints.verifyOtp, data: body);
      // ignore: avoid_print
      print('=== VERIFY OTP RESPONSE ===');
      // ignore: avoid_print
      print(response.data);
      if (response.data['success'] == true) {
        final data = response.data['data'];
        if (data != null && data['token'] != null) {
          await SecureStorage.saveToken(data['token']);
          final role = data['user']?['role'] ?? 'customer';
          await SecureStorage.saveRole(role);
          // ignore: avoid_print
          print('USER ROLE: $role');
          await SecureStorage.savePhone(phone);
          final loggedInPosition = data['user']?['position'] as String?;
          if (loggedInPosition != null && loggedInPosition.isNotEmpty) {
            await SecureStorage.savePosition(loggedInPosition);
          }
          final loggedInName = data['user']?['fullName'] as String?;
          if (loggedInName != null && loggedInName.isNotEmpty) {
            await SecureStorage.saveFullName(loggedInName);
          }
          if (data['user']?['id'] != null) {
            await SecureStorage.saveUserId(data['user']['id'] as String);
          }
          final loggedInCarNumber = data['user']?['carNumber'] as String?;
          if (loggedInCarNumber != null && loggedInCarNumber.isNotEmpty) {
            await SecureStorage.saveCarNumber(loggedInCarNumber);
          }
          if (role == 'salesman') {
            await GPSService().startTracking();
            if (mounted) context.go('/salesman-dashboard');
          } else if (role == 'driver') {
            await GPSService().startTracking();
            if (mounted) context.go('/driver-dashboard');
          } else {
            if (mounted) context.go('/home');
          }
        } else {
          if (mounted) { context.go('/pending-approval'); }
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(response.data['message'] ?? 'Invalid OTP')));
        }
      }
    } catch (e) {
      debugPrint('OTP error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surfaceContainerLowest,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.marginMobile, vertical: AppSpacing.md),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => context.go('/login'),
                    icon: const Icon(Icons.arrow_back, color: AppColors.onPrimaryFixed),
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.marginMobile),
                  child: Column(
                    children: [
                      // Icon
                      Container(
                        width: 96, height: 96,
                        decoration: BoxDecoration(
                          color: AppColors.tertiaryFixed.withValues(alpha: 0.2),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(Icons.check_circle, size: 48, color: AppColors.onTertiaryContainer),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      Text('Verify Your Number',
                          textAlign: TextAlign.center,
                          style: AppTextStyles.headlineLgMobile.copyWith(color: AppColors.onPrimaryFixed)),
                      const SizedBox(height: AppSpacing.base),
                      RichText(
                        textAlign: TextAlign.center,
                        text: TextSpan(
                          style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurfaceVariant),
                          children: [
                            const TextSpan(text: 'OTP sent to '),
                            TextSpan(
                              text: _phone,
                              style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.onPrimaryFixed),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.lg),

                      // OTP boxes
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: List.generate(6, (index) => SizedBox(
                          width: 48, height: 64,
                          child: TextField(
                            controller: _controllers[index],
                            focusNode: _focusNodes[index],
                            textAlign: TextAlign.center,
                            maxLength: 1,
                            keyboardType: TextInputType.number,
                            style: AppTextStyles.headlineMd.copyWith(color: AppColors.onPrimaryFixed),
                            decoration: InputDecoration(
                              counterText: '',
                              filled: true,
                              fillColor: AppColors.surfaceContainerLowest,
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(AppRadius.base),
                                borderSide: const BorderSide(color: AppColors.onPrimaryFixed, width: 2),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(AppRadius.base),
                                borderSide: const BorderSide(color: AppColors.primary, width: 2),
                              ),
                            ),
                            onChanged: (v) => _onChanged(v, index),
                          ),
                        )),
                      ),
                      const SizedBox(height: AppSpacing.lg),

                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _isLoading ? null : _verifyOtp,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                          ),
                          child: _isLoading
                              ? const SizedBox(
                                  width: 22, height: 22,
                                  child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                                )
                              : Row(
                                  mainAxisSize: MainAxisSize.min,
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text('VERIFY OTP', style: AppTextStyles.labelMd.copyWith(color: Colors.white)),
                                    const SizedBox(width: 8),
                                    const Icon(Icons.arrow_forward, size: 20, color: Colors.white),
                                  ],
                                ),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),

                      Text("Didn't receive the code?",
                          style: AppTextStyles.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                      const SizedBox(height: AppSpacing.xs),
                      GestureDetector(
                        onTap: _resendOtp,
                        child: Text(
                          _resendSeconds > 0 ? 'Resend OTP in ${_resendSeconds}s' : 'Resend OTP Now',
                          style: AppTextStyles.labelMd.copyWith(
                            color: _resendSeconds > 0 ? AppColors.onSurfaceVariant : AppColors.primary,
                            decoration: _resendSeconds > 0 ? null : TextDecoration.underline,
                          ),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
