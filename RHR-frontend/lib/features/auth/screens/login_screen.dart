import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/utils/phone_normalizer.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  bool _isLoading = false;

  static const _navy     = Color(0xFF00185D);
  static const _navyDark = Color(0xFF000D3A);

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
        final isNewUser  = response.data['data']?['isNewUser'] == true;
        final isPending  = response.data['data']?['isPending'] == true;
        if (mounted) {
          if (isPending) {
            context.go('/pending-approval');
          } else if (isNewUser) {
            context.push('/signup', extra: phone);
          } else {
            context.push('/otp', extra: phone);
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _navyDark,
      body: Stack(
        children: [
          // Dark navy top gradient
          Positioned(
            top: 0, left: 0, right: 0,
            height: MediaQuery.of(context).size.height * 0.45,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [_navyDark, Color(0xFF0A2472)],
                ),
              ),
            ),
          ),

          SafeArea(
            child: Column(
              children: [
                // Top branding
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
                  child: Row(children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.asset(
                        'assets/images/rhr-logo.jpeg',
                        width: 44, height: 44, fit: BoxFit.cover,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('RHR Connect',
                          style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: 0.2)),
                      const Text('ENTERPRISE PORTAL',
                          style: TextStyle(color: Colors.white54, fontSize: 9, letterSpacing: 1.4, fontWeight: FontWeight.w600)),
                    ]),
                  ]),
                ),

                // Hero text
                const Padding(
                  padding: EdgeInsets.fromLTRB(24, 36, 24, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Sign In',
                          style: TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
                      SizedBox(height: 6),
                      Text('Access field route, client accounts\nand booking engine',
                          style: TextStyle(color: Colors.white60, fontSize: 13, height: 1.5)),
                    ],
                  ),
                ),

                const SizedBox(height: 32),

                // White card with form
                Expanded(
                  child: Container(
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.only(
                        topLeft:  Radius.circular(32),
                        topRight: Radius.circular(32),
                      ),
                    ),
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Phone label
                          const Text('Phone Number',
                              style: TextStyle(color: _navy, fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 0.2)),
                          const SizedBox(height: 8),

                          // Phone input
                          Container(
                            decoration: BoxDecoration(
                              color: const Color(0xFFF5F7FA),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: const Color(0xFFE0E5EF)),
                            ),
                            child: Row(children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
                                decoration: const BoxDecoration(
                                  border: Border(right: BorderSide(color: Color(0xFFE0E5EF))),
                                ),
                                child: Row(children: [
                                  const Text('🇵🇰', style: TextStyle(fontSize: 18)),
                                  const SizedBox(width: 6),
                                  Text('+92', style: AppTextStyles.bodyMd.copyWith(color: _navy, fontWeight: FontWeight.w700)),
                                ]),
                              ),
                              Expanded(
                                child: TextField(
                                  controller: _phoneController,
                                  keyboardType: TextInputType.phone,
                                  style: AppTextStyles.bodyMd.copyWith(color: _navy),
                                  decoration: InputDecoration(
                                    hintText: '3XX XXXXXXX',
                                    hintStyle: AppTextStyles.bodyMd.copyWith(color: AppColors.outline),
                                    border: InputBorder.none,
                                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
                                  ),
                                ),
                              ),
                            ]),
                          ),

                          const SizedBox(height: 28),

                          // Sign In button
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: _isLoading ? null : _sendOtp,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: _navy,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                elevation: 0,
                              ),
                              child: _isLoading
                                  ? const SizedBox(
                                      width: 22, height: 22,
                                      child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                                    )
                                  : Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                                      Text('Send OTP', style: AppTextStyles.headlineSm.copyWith(color: Colors.white, fontSize: 16)),
                                      const SizedBox(width: 8),
                                      const Icon(Icons.arrow_forward_rounded, size: 20),
                                    ]),
                            ),
                          ),

                          const SizedBox(height: 24),

                          // Divider
                          Row(children: [
                            const Expanded(child: Divider(color: Color(0xFFE0E5EF))),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              child: Text('OR', style: AppTextStyles.bodySm.copyWith(color: Colors.black38, letterSpacing: 1.2)),
                            ),
                            const Expanded(child: Divider(color: Color(0xFFE0E5EF))),
                          ]),

                          const SizedBox(height: 24),

                          // Register link
                          Center(
                            child: GestureDetector(
                              onTap: () => context.push('/signup'),
                              child: RichText(
                                text: TextSpan(
                                  text: 'New Customer? ',
                                  style: AppTextStyles.bodyMd.copyWith(color: Colors.black45, fontWeight: FontWeight.w500),
                                  children: [
                                    TextSpan(
                                      text: 'Register here',
                                      style: AppTextStyles.bodyMd.copyWith(color: _navy, fontWeight: FontWeight.w700),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),

                          const SizedBox(height: 32),

                          // Footer info
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF5F7FA),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFFE0E5EF)),
                            ),
                            child: Row(children: [
                              const Icon(Icons.info_outline_rounded, size: 16, color: Colors.black38),
                              const SizedBox(width: 8),
                              const Expanded(
                                child: Text(
                                  'Accounts are created by RHR admin.',
                                  style: TextStyle(color: Colors.black45, fontSize: 12),
                                ),
                              ),
                            ]),
                          ),

                          const SizedBox(height: 20),

                          Center(
                            child: Text(
                              'Karachi · Hyderabad · Sukkur',
                              style: AppTextStyles.bodySm.copyWith(color: Colors.black26, letterSpacing: 1.2),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
