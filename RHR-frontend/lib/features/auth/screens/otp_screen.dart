import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../services/gps_service.dart';
import '../../../shared/widgets/rhr_button.dart';

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
  final List<double> _boxScales = List.generate(6, (_) => 1.0);
  bool _isLoading = false;

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

  String _normalizePhone(String raw) {
    raw = raw.replaceAll(' ', '').trim();
    if (raw.startsWith('+92')) raw = '0${raw.substring(3)}';
    if (raw.startsWith('92') && raw.length == 12) raw = '0${raw.substring(2)}';
    if (!raw.startsWith('0')) raw = '0$raw';
    return raw;
  }

  void _onChanged(String value, int index) {
    if (value.isNotEmpty) {
      setState(() => _boxScales[index] = 1.25);
      Future.delayed(const Duration(milliseconds: 120), () {
        if (mounted) setState(() => _boxScales[index] = 1.0);
      });
    }
    if (value.isNotEmpty && index < 5) _focusNodes[index + 1].requestFocus();
    if (value.isEmpty && index > 0) _focusNodes[index - 1].requestFocus();
  }

  void _verifyOtp() async {
    final otp = _controllers.map((c) => c.text).join();
    if (otp.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Enter all 6 digits')));
      return;
    }
    setState(() => _isLoading = true);
    final phone = _normalizePhone(_phone);
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
          if (role == 'salesman') {
            await GPSService().startTracking();
            if (mounted) context.go('/salesman-dashboard');
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
      backgroundColor: AppColors.warmGrey,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(children: [
              const SizedBox(height: 60),
              Container(
                width: 90, height: 90,
                decoration: BoxDecoration(
                    color: AppColors.navy, borderRadius: BorderRadius.circular(20),
                    boxShadow: [BoxShadow(
                        color: AppColors.navy.withValues(alpha: 0.3),
                        blurRadius: 16, offset: const Offset(0, 6))]),
                child: const Icon(Icons.message_rounded, size: 44, color: AppColors.white),
              ),
              const SizedBox(height: 24),
              const Text('Verify Your Number', style: TextStyle(
                  fontSize: 26, fontWeight: FontWeight.bold, color: AppColors.navy)),
              const SizedBox(height: 8),
              Text('OTP sent to $_phone', style: const TextStyle(
                  fontSize: 13, color: AppColors.steelBlue)),
              const SizedBox(height: 8),
              Container(width: 60, height: 3, decoration: BoxDecoration(
                  color: AppColors.orange, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 48),
              Container(
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                    color: AppColors.white, borderRadius: BorderRadius.circular(20),
                    boxShadow: [BoxShadow(
                        color: Colors.black.withValues(alpha: 0.08),
                        blurRadius: 24, offset: const Offset(0, 6))]),
                child: Column(children: [
                  Container(height: 4, margin: const EdgeInsets.only(bottom: 28),
                      decoration: BoxDecoration(color: AppColors.orange,
                          borderRadius: BorderRadius.circular(2))),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: List.generate(6, (index) => AnimatedScale(
                      scale: _boxScales[index],
                      duration: const Duration(milliseconds: 120),
                      curve: Curves.easeOut,
                      child: SizedBox(
                        width: 44, height: 54,
                        child: TextField(
                          controller: _controllers[index],
                          focusNode: _focusNodes[index],
                          textAlign: TextAlign.center,
                          maxLength: 1,
                          keyboardType: TextInputType.number,
                          style: const TextStyle(fontSize: 22,
                              fontWeight: FontWeight.bold, color: AppColors.navy),
                          decoration: InputDecoration(
                              counterText: '',
                              filled: true, fillColor: AppColors.warmGrey,
                              border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(10),
                                  borderSide: BorderSide.none),
                              focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(10),
                                  borderSide: const BorderSide(
                                      color: AppColors.orange, width: 2))),
                          onChanged: (v) => _onChanged(v, index),
                        ),
                      ),
                    )),
                  ),
                  const SizedBox(height: 32),
                  RHRButton(text: 'Verify OTP',
                      onPressed: _verifyOtp, isLoading: _isLoading),
                  const SizedBox(height: 20),
                  GestureDetector(
                    onTap: () => context.go('/login'),
                    child: const Text('Back to Login',
                        style: TextStyle(color: AppColors.steelBlue, fontSize: 13)),
                  ),
                ]),
              ),
              const SizedBox(height: 32),
              const Text('Karachi . Hyderabad . Sukkur', style: TextStyle(
                  fontSize: 12, color: AppColors.steelBlue, letterSpacing: 1.5)),
            ]),
          ),
        ),
      ),
    );
  }
}
