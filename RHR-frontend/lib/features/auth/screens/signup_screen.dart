import 'dart:io';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/utils/phone_normalizer.dart';
import '../../../shared/widgets/wave_header.dart';

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
  final _carNumberController = TextEditingController();
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
    _carNumberController.dispose();
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
      if (_selectedRole == 'salesman')
        'position': _positionController.text.trim()
      else if (_selectedRole == 'driver')
        'carNumber': _carNumberController.text.trim()
      else ...{
        'businessName': _businessController.text.trim(),
        'address':      _addressController.text.trim(),
      },
    });
  }

  static const _fieldBorder = Color(0xFFCED4DA);

  Widget _field({
    required String label,
    required IconData icon,
    required TextEditingController controller,
    String? hint,
    TextInputType? keyboardType,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurface),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: AppTextStyles.bodyMd.copyWith(color: AppColors.outline.withValues(alpha: 0.7)),
            prefixIcon: Icon(icon, color: AppColors.outline),
            filled: true,
            fillColor: AppColors.surfaceContainerLowest,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.base),
              borderSide: const BorderSide(color: _fieldBorder),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.base),
              borderSide: const BorderSide(color: _fieldBorder),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.base),
              borderSide: const BorderSide(color: Color(0xFF073C9F), width: 2),
            ),
            contentPadding: const EdgeInsets.symmetric(vertical: 14),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            WaveHeader(title: 'Create Account', onBack: () => context.go('/login')),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                    AppSpacing.marginMobile, AppSpacing.md, AppSpacing.marginMobile, AppSpacing.lg),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  // Info banner
                  Container(
                    padding: const EdgeInsets.all(AppSpacing.sm),
                    decoration: BoxDecoration(
                      color: AppColors.primaryFixed,
                      borderRadius: BorderRadius.circular(AppRadius.base),
                      border: Border.all(color: AppColors.primaryFixedDim),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.info, color: AppColors.primary, size: 20),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Your account needs admin approval before you can start ordering.',
                            style: AppTextStyles.bodySm.copyWith(color: AppColors.onPrimaryFixed),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),

                  // Role selector
                  Text('I am a:', style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurface)),
                  const SizedBox(height: AppSpacing.base),
                  Row(children: [
                    Expanded(child: _RoleCard(
                      label: 'Customer', icon: Icons.storefront,
                      selected: _selectedRole == 'customer',
                      onTap: () => setState(() => _selectedRole = 'customer'),
                    )),
                    const SizedBox(width: AppSpacing.base),
                    Expanded(child: _RoleCard(
                      label: 'Salesman', icon: Icons.handshake_outlined,
                      selected: _selectedRole == 'salesman',
                      onTap: () => setState(() => _selectedRole = 'salesman'),
                    )),
                    const SizedBox(width: AppSpacing.base),
                    Expanded(child: _RoleCard(
                      label: 'Driver', icon: Icons.local_shipping_outlined,
                      selected: _selectedRole == 'driver',
                      onTap: () => setState(() => _selectedRole = 'driver'),
                    )),
                  ]),
                  const SizedBox(height: AppSpacing.md),

                  // Form card
                  Container(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceContainerLowest,
                      borderRadius: BorderRadius.circular(AppRadius.lg),
                      border: Border.all(color: AppColors.outlineVariant),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                        child: Text('Personal Details',
                            style: AppTextStyles.headlineSm.copyWith(color: AppColors.onSurface)),
                      ),
                      const Divider(color: AppColors.outlineVariant, height: 1),
                      const SizedBox(height: AppSpacing.md),

                      Center(
                        child: Stack(children: [
                          CircleAvatar(
                            radius: 44,
                            backgroundColor: AppColors.surfaceContainerLow,
                            backgroundImage: _profileImage != null ? FileImage(_profileImage!) : null,
                            child: _profileImage == null
                                ? const Icon(Icons.person, size: 44, color: AppColors.secondary)
                                : null,
                          ),
                          Positioned(bottom: 0, right: 0,
                              child: GestureDetector(
                                onTap: _pickImage,
                                child: Container(
                                    width: 30, height: 30,
                                    decoration: BoxDecoration(
                                        color: AppColors.primary,
                                        shape: BoxShape.circle,
                                        border: Border.all(color: Colors.white, width: 2)),
                                    child: const Icon(Icons.camera_alt, color: Colors.white, size: 15)),
                              )),
                        ]),
                      ),
                      const SizedBox(height: AppSpacing.md),

                      _field(label: 'Full Name', icon: Icons.person, controller: _nameController, hint: 'Enter your full name'),
                      const SizedBox(height: AppSpacing.sm),
                      _field(label: 'Phone Number', icon: Icons.phone_iphone, controller: _phoneController,
                          hint: '3XX XXXXXXX', keyboardType: TextInputType.phone),
                      const SizedBox(height: AppSpacing.sm),

                      if (_selectedRole == 'salesman')
                        _field(label: 'Position', icon: Icons.badge_outlined, controller: _positionController,
                            hint: 'e.g. Sales Executive, Area Manager')
                      else if (_selectedRole == 'driver')
                        _field(label: 'Car Number', icon: Icons.directions_car_outlined, controller: _carNumberController,
                            hint: 'e.g. KHI-1234')
                      else ...[
                        _field(label: 'Business Name', icon: Icons.store_outlined, controller: _businessController,
                            hint: 'Shop or company name'),
                        const SizedBox(height: AppSpacing.sm),
                        _field(label: 'Address', icon: Icons.location_on, controller: _addressController,
                            hint: 'Shop address, area'),
                      ],
                      const SizedBox(height: AppSpacing.sm),

                      // City
                      Text('City', style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
                      const SizedBox(height: 6),
                      Container(
                        decoration: BoxDecoration(
                          border: Border.all(color: _fieldBorder),
                          borderRadius: BorderRadius.circular(AppRadius.base),
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: _selectedCity,
                            isExpanded: true,
                            icon: const Icon(Icons.arrow_drop_down, color: AppColors.outline),
                            style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurface),
                            items: _cities.map((c) => DropdownMenuItem(
                              value: c['id'],
                              child: Row(children: [
                                const Icon(Icons.location_on, color: AppColors.outline, size: 18),
                                const SizedBox(width: 8),
                                Text(c['name']!),
                              ]),
                            )).toList(),
                            onChanged: (v) => setState(() => _selectedCity = v!),
                          ),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),

                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _isLoading ? null : _proceed,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                          ),
                          child: _isLoading
                              ? const SizedBox(width: 22, height: 22,
                                  child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                              : Row(
                                  mainAxisSize: MainAxisSize.min,
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text('Register Account', style: AppTextStyles.labelMd.copyWith(color: Colors.white)),
                                    const SizedBox(width: 8),
                                    const Icon(Icons.arrow_forward, size: 18, color: Colors.white),
                                  ],
                                ),
                        ),
                      ),
                    ]),
                  ),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  const _RoleCard({required this.label, required this.icon, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : AppColors.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: selected ? AppColors.primary : AppColors.outlineVariant),
        ),
        child: Column(children: [
          Icon(icon, color: selected ? Colors.white : AppColors.primary, size: 26),
          const SizedBox(height: 6),
          Text(label, style: AppTextStyles.labelMd.copyWith(
              color: selected ? Colors.white : AppColors.onSurface)),
        ]),
      ),
    );
  }
}
