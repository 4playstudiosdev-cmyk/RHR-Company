import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../services/gps_service.dart';
import '../../../services/push_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController    = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading   = false;
  bool _obscure     = true;

  static const _navy     = Color(0xFF00185D);
  static const _navyDark = Color(0xFF000D3A);

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _login() async {
    final email    = _emailController.text.trim().toLowerCase();
    final password = _passwordController.text;
    if (email.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter your email and password.')));
      return;
    }

    setState(() => _isLoading = true);
    try {
      final response = await DioClient.instance.post(
        ApiEndpoints.salesmanLogin,
        data: {'email': email, 'password': password},
      );

      if (response.data['success'] == true) {
        final data = response.data['data'];
        await SecureStorage.saveToken(data['token']);
        final role = data['user']?['role'] ?? 'salesman';
        await SecureStorage.saveRole(role);

        final loggedInName = data['user']?['fullName'] as String?;
        if (loggedInName != null && loggedInName.isNotEmpty) {
          await SecureStorage.saveFullName(loggedInName);
        }
        if (data['user']?['id'] != null) {
          await SecureStorage.saveUserId(data['user']['id'] as String);
        }
        final loggedInPosition = data['user']?['position'] as String?;
        if (loggedInPosition != null && loggedInPosition.isNotEmpty) {
          await SecureStorage.savePosition(loggedInPosition);
        }

        unawaited(PushService.registerToken());

        final profileComplete = data['user']?['profileComplete'] == true;
        await SecureStorage.saveSalesmanProfileComplete(profileComplete);

        if (!mounted) return;
        final locationGranted = await GPSService().startTrackingWithConsent(context);
        if (!mounted) return;
        if (!locationGranted) {
          context.go('/location-required');
        } else if (!profileComplete) {
          context.go('/salesman-profile-setup', extra: true);
        } else {
          context.go('/salesman-dashboard');
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(response.data['message'] ?? 'Invalid credentials.')));
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Login failed. Check your credentials and try again.')));
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
                          // Email
                          const Text('Email',
                              style: TextStyle(color: _navy, fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 0.2)),
                          const SizedBox(height: 8),
                          Container(
                            decoration: BoxDecoration(
                              color: const Color(0xFFF5F7FA),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: const Color(0xFFE0E5EF)),
                            ),
                            child: TextField(
                              controller: _emailController,
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.next,
                              style: AppTextStyles.bodyMd.copyWith(color: _navy),
                              decoration: InputDecoration(
                                hintText: 'firstname@rhr.com',
                                hintStyle: AppTextStyles.bodyMd.copyWith(color: AppColors.outline),
                                border: InputBorder.none,
                                prefixIcon: const Icon(Icons.email_outlined, color: Color(0xFF7B8DB0), size: 20),
                                contentPadding: const EdgeInsets.symmetric(vertical: 15),
                              ),
                            ),
                          ),

                          const SizedBox(height: 20),

                          // Password
                          const Text('Password',
                              style: TextStyle(color: _navy, fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 0.2)),
                          const SizedBox(height: 8),
                          Container(
                            decoration: BoxDecoration(
                              color: const Color(0xFFF5F7FA),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: const Color(0xFFE0E5EF)),
                            ),
                            child: TextField(
                              controller: _passwordController,
                              obscureText: _obscure,
                              textInputAction: TextInputAction.done,
                              onSubmitted: (_) => _login(),
                              style: AppTextStyles.bodyMd.copyWith(color: _navy),
                              decoration: InputDecoration(
                                hintText: '••••••••••',
                                hintStyle: AppTextStyles.bodyMd.copyWith(color: AppColors.outline),
                                border: InputBorder.none,
                                prefixIcon: const Icon(Icons.lock_outline_rounded, color: Color(0xFF7B8DB0), size: 20),
                                contentPadding: const EdgeInsets.symmetric(vertical: 15),
                                suffixIcon: IconButton(
                                  icon: Icon(
                                    _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                                    color: const Color(0xFF7B8DB0), size: 20,
                                  ),
                                  onPressed: () => setState(() => _obscure = !_obscure),
                                ),
                              ),
                            ),
                          ),

                          const SizedBox(height: 28),

                          // Sign In button
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: _isLoading ? null : _login,
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
                                      Text('Sign In', style: AppTextStyles.headlineSm.copyWith(color: Colors.white, fontSize: 16)),
                                      const SizedBox(width: 8),
                                      const Icon(Icons.arrow_forward_rounded, size: 20),
                                    ]),
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
                                  'Login credentials are provided by RHR admin.',
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
