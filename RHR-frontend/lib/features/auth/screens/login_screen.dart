import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/rhr_input_field.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with TickerProviderStateMixin {
  final _phoneController = TextEditingController();
  bool _isLoading = false;

  late final AnimationController _entryController;
  late final Animation<double> _logoFade;
  late final Animation<Offset> _logoSlide;
  late final Animation<double> _cardFade;
  late final Animation<Offset> _cardSlide;

  late final AnimationController _pulseController;
  late final Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _entryController = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))
      ..forward();
    _logoFade = CurvedAnimation(
        parent: _entryController, curve: const Interval(0.0, 0.6, curve: Curves.easeOut));
    _logoSlide = Tween<Offset>(begin: const Offset(0, -0.25), end: Offset.zero).animate(
        CurvedAnimation(parent: _entryController, curve: const Interval(0.0, 0.6, curve: Curves.easeOutCubic)));
    _cardFade = CurvedAnimation(
        parent: _entryController, curve: const Interval(0.3, 1.0, curve: Curves.easeOut));
    _cardSlide = Tween<Offset>(begin: const Offset(0, 0.25), end: Offset.zero).animate(
        CurvedAnimation(parent: _entryController, curve: const Interval(0.3, 1.0, curve: Curves.easeOutCubic)));

    _pulseController = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
      ..repeat(reverse: true);
    _pulse = Tween<double>(begin: 1.0, end: 1.03)
        .animate(CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _entryController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  String _normalizePhone(String raw) {
    raw = raw.replaceAll(' ', '').trim();
    if (raw.startsWith('+92')) raw = '0${raw.substring(3)}';
    if (raw.startsWith('92')) raw = '0${raw.substring(2)}';
    if (!raw.startsWith('0')) raw = '0$raw';
    return raw; // → 03272155131
  }

  void _sendOtp() async {
    if (_phoneController.text.isEmpty) return;
    setState(() => _isLoading = true);

    final phone = _normalizePhone(_phoneController.text);

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              children: [
                const SizedBox(height: 60),

                // Logo
                SlideTransition(
                  position: _logoSlide,
                  child: FadeTransition(
                    opacity: _logoFade,
                    child: Column(children: [
                      Image.asset(
                        'assets/images/rhr-logo.jpeg',
                        width: 110,
                        height: 110,
                        fit: BoxFit.contain,
                      ),

                      const SizedBox(height: 20),

                      const Text(
                        'RHR & Company',
                        style: TextStyle(fontSize: 30, fontWeight: FontWeight.bold, color: AppColors.navy),
                      ),

                      const SizedBox(height: 6),

                      const Text(
                        'Premium Tile Bond & Grout Manufacturer',
                        style: TextStyle(fontSize: 13, color: AppColors.steelBlue),
                      ),

                      const SizedBox(height: 8),

                      Container(
                        width: 60,
                        height: 3,
                        decoration: BoxDecoration(
                          color: AppColors.orange,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ]),
                  ),
                ),

                const SizedBox(height: 48),

                // Login Card
                SlideTransition(
                  position: _cardSlide,
                  child: FadeTransition(
                    opacity: _cardFade,
                    child: Container(
                  padding: const EdgeInsets.all(28),
                  decoration: BoxDecoration(
                    color: AppColors.white,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.08),
                        blurRadius: 24,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 24),
                        decoration: BoxDecoration(
                          color: AppColors.orange,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),

                      const Text(
                        'Welcome',
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.navy),
                      ),

                      const SizedBox(height: 4),

                      const Text(
                        'Enter your phone number to continue — for customers and salesmen',
                        style: TextStyle(fontSize: 13, color: AppColors.steelBlue),
                      ),

                      const SizedBox(height: 28),

                      RHRInputField(
                        label: 'Phone Number',
                        hint: '3XX XXXXXXX',
                        controller: _phoneController,
                        keyboardType: TextInputType.phone,
                        prefixText: '+92 ',
                      ),

                      const SizedBox(height: 32),

                      ScaleTransition(
                        scale: _isLoading ? const AlwaysStoppedAnimation(1.0) : _pulse,
                        child: RHRButton(
                          text: 'Send OTP',
                          onPressed: _sendOtp,
                          isLoading: _isLoading,
                        ),
                      ),

                      const SizedBox(height: 16),

                      Center(
                        child: GestureDetector(
                          onTap: () => context.go('/signup'),
                          child: const Text.rich(
                            TextSpan(
                              text: 'New here? ',
                              style: TextStyle(color: AppColors.steelBlue, fontSize: 13),
                              children: [
                                TextSpan(
                                  text: 'Register here',
                                  style: TextStyle(color: AppColors.navy, fontWeight: FontWeight.bold),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                  ),
                ),
                const SizedBox(height: 32),

                const Text(
                  'Karachi · Hyderabad · Sukkur',
                  style: TextStyle(fontSize: 12, color: AppColors.steelBlue, letterSpacing: 1.5),
                ),

                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
