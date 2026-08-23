import 'dart:io';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/utils/phone_normalizer.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/rhr_input_field.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';

class SignupScreen extends StatefulWidget {
  final String? phone;
  const SignupScreen({super.key, this.phone});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _phoneController    = TextEditingController();
  final _nameController     = TextEditingController();
  final _businessController = TextEditingController();
  final _addressController  = TextEditingController();
  final _positionController = TextEditingController();
  String _selectedRole = 'customer';
  String _selectedCity = ApiEndpoints.khiId;
  bool _isLoading = false;
  File? _profileImage;

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final image = await picker.pickImage(
        source: ImageSource.gallery, imageQuality: 70);
    if (image != null) {
      setState(() => _profileImage = File(image.path));
    }
  }

  final List<Map<String, String>> _cities = [
    {'name': 'Karachi (Head Office)', 'id': '1e5962c6-33a7-460b-913e-9e08db46973a'},
    {'name': 'Hyderabad',             'id': '09a1fda3-7ac0-406a-8f42-75d973dc3b7e'},
    {'name': 'Sukkur',                'id': '00f79d89-0d36-4704-8865-fc7bbd662267'},
  ];

  @override
  void initState() {
    super.initState();
    // Pre-fill if we arrived from the login screen's phone/OTP step; the
    // login screen always hands off a leading-zero-normalized number.
    final incoming = widget.phone;
    if (incoming != null && incoming.isNotEmpty) {
      _phoneController.text = incoming.startsWith('0') ? incoming.substring(1) : incoming;
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _nameController.dispose();
    _businessController.dispose();
    _addressController.dispose();
    _positionController.dispose();
    super.dispose();
  }

  Future<void> _proceed() async {
    if (_phoneController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Phone number is required')));
      return;
    }
    if (_nameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Full name is required')));
      return;
    }

    final phone = PhoneNormalizer.normalize(_phoneController.text);

    // If we didn't arrive here with an already-OTP'd phone (e.g. user tapped
    // "Register here" directly instead of going through the login screen),
    // no OTP has been sent yet — send it now before moving on.
    if (widget.phone == null || widget.phone!.isEmpty) {
      setState(() => _isLoading = true);
      try {
        final response = await DioClient.instance.post(
          ApiEndpoints.sendOtp,
          data: {'phone': phone},
        );
        if (response.data['success'] != true) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Text(response.data['message'] ?? 'Could not send OTP')));
          }
          return;
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Server error. Please try again.')));
        }
        return;
      } finally {
        if (mounted) setState(() => _isLoading = false);
      }
    }

    if (!mounted) return;
    context.go('/otp', extra: {
      'phone':     phone,
      'fullName':  _nameController.text.trim(),
      'companyId': _selectedCity,
      'role':      _selectedRole,
      ..._selectedRole == 'salesman'
          ? {'position': _positionController.text.trim()}
          : {
              'businessName': _businessController.text.trim(),
              'address':      _addressController.text.trim(),
            },
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: Colors.transparent, elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.navy),
          onPressed: () => context.go('/login'),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Create Account', style: TextStyle(
                fontSize: 28, fontWeight: FontWeight.bold, color: AppColors.navy)),
            const SizedBox(height: 4),
            const Text('Fill in your details to register',
                style: TextStyle(fontSize: 13, color: AppColors.steelBlue)),
            const SizedBox(height: 8),
            Container(width: 60, height: 3, decoration: BoxDecoration(
                color: AppColors.orange, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 24),

            // Phone
            StaggeredFadeIn(index: 0, child: RHRInputField(
              label: 'Phone Number',
              hint: '3XX XXXXXXX',
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              prefixText: '+92 ',
            )),
            const SizedBox(height: 20),

            // Role Selection
            const Text('I am a:', style: TextStyle(
                fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 15)),
            const SizedBox(height: 10),
            StaggeredFadeIn(index: 1, child: Row(children: [
              Expanded(child: TapScale(
                onTap: () => setState(() => _selectedRole = 'customer'),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                      color: _selectedRole == 'customer' ? AppColors.navy : AppColors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.navy)),
                  child: Column(children: [
                    Icon(Icons.person_outline,
                        color: _selectedRole == 'customer' ? Colors.white : AppColors.navy,
                        size: 28),
                    const SizedBox(height: 6),
                    Text('Customer', style: TextStyle(
                        color: _selectedRole == 'customer' ? Colors.white : AppColors.navy,
                        fontWeight: FontWeight.bold)),
                  ]),
                ),
              )),
              const SizedBox(width: 12),
              Expanded(child: TapScale(
                onTap: () => setState(() => _selectedRole = 'salesman'),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                      color: _selectedRole == 'salesman' ? AppColors.orange : AppColors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.orange)),
                  child: Column(children: [
                    Icon(Icons.handshake_outlined,
                        color: _selectedRole == 'salesman' ? Colors.white : AppColors.orange,
                        size: 28),
                    const SizedBox(height: 6),
                    Text('Salesman', style: TextStyle(
                        color: _selectedRole == 'salesman' ? Colors.white : AppColors.orange,
                        fontWeight: FontWeight.bold)),
                  ]),
                ),
              )),
            ])),
            const SizedBox(height: 20),

            // City Selection
            const Text('Select City/Branch:', style: TextStyle(
                fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 15)),
            const SizedBox(height: 10),
            StaggeredFadeIn(index: 2, child: Column(children: _cities.map((city) => TapScale(
              onTap: () => setState(() => _selectedCity = city['id']!),
              child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                    color: _selectedCity == city['id']
                        ? AppColors.navy.withValues(alpha: 0.1) : AppColors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                        color: _selectedCity == city['id'] ? AppColors.navy : AppColors.disabled,
                        width: _selectedCity == city['id'] ? 2 : 1)),
                child: Row(children: [
                  Icon(Icons.location_city,
                      color: _selectedCity == city['id'] ? AppColors.navy : AppColors.steelBlue),
                  const SizedBox(width: 12),
                  Text(city['name']!, style: TextStyle(
                      fontWeight: _selectedCity == city['id']
                          ? FontWeight.bold : FontWeight.normal,
                      color: _selectedCity == city['id']
                          ? AppColors.navy : AppColors.steelBlue)),
                  const Spacer(),
                  if (_selectedCity == city['id'])
                    const Icon(Icons.check_circle, color: AppColors.navy, size: 20),
                ]),
              ),
            )).toList())),
            const SizedBox(height: 20),

            // Form
            StaggeredFadeIn(index: 3, child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                  color: AppColors.white, borderRadius: BorderRadius.circular(20),
                  boxShadow: [BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      blurRadius: 16, offset: const Offset(0, 4))]),
              child: Column(children: [
                Container(height: 4, margin: const EdgeInsets.only(bottom: 20),
                    decoration: BoxDecoration(color: AppColors.orange,
                        borderRadius: BorderRadius.circular(2))),
                Center(
                  child: Stack(children: [
                    CircleAvatar(
                      radius: 48,
                      backgroundColor: AppColors.warmGrey,
                      backgroundImage: _profileImage != null
                          ? FileImage(_profileImage!)
                          : null,
                      child: _profileImage == null
                          ? const Icon(Icons.person,
                              size: 48, color: AppColors.steelBlue)
                          : null,
                    ),
                    Positioned(bottom: 0, right: 0,
                        child: GestureDetector(
                          onTap: _pickImage,
                          child: Container(
                              width: 32, height: 32,
                              decoration: BoxDecoration(
                                  color: AppColors.orange,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                      color: Colors.white, width: 2)),
                              child: const Icon(Icons.camera_alt,
                                  color: Colors.white, size: 16)),
                        )),
                  ]),
                ),
                const SizedBox(height: 20),
                RHRInputField(label: 'Full Name *', hint: 'Ahmed Khan',
                    controller: _nameController),
                const SizedBox(height: 16),
                if (_selectedRole == 'salesman')
                  RHRInputField(label: 'Position', hint: 'e.g. Sales Executive, Area Manager',
                      controller: _positionController)
                else ...[
                  RHRInputField(label: 'Business Name', hint: 'Shop or company name',
                      controller: _businessController),
                  const SizedBox(height: 16),
                  RHRInputField(label: 'Address', hint: 'Shop address, area',
                      controller: _addressController),
                ],
                const SizedBox(height: 28),
                RHRButton(text: 'Continue to OTP Verification',
                    onPressed: _proceed, isLoading: _isLoading),
              ]),
            )),
            const SizedBox(height: 32),
          ]),
        ),
      ),
    );
  }
}
