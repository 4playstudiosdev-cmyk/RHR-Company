import 'dart:convert';
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
import '../../../shared/widgets/shop_location_picker_screen.dart';
import '../../../shared/router/app_transitions.dart';

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
  final _emailController    = TextEditingController();
  final _nicController      = TextEditingController();
  final _whatsappController = TextEditingController();
  final _areaController     = TextEditingController();
  String _selectedRole = 'customer';
  String _selectedCity = ApiEndpoints.khiId;
  bool _isLoading = false;
  File? _profileImage;
  File? _nicFrontImage;
  File? _nicBackImage;
  File? _shopImage;
  double? _shopLatitude;
  double? _shopLongitude;

  Future<void> _pickImage(String target) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined, color: AppColors.primary),
              title: const Text('Take Photo'),
              onTap: () => Navigator.of(sheetContext).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined, color: AppColors.primary),
              title: const Text('Choose from Gallery'),
              onTap: () => Navigator.of(sheetContext).pop(ImageSource.gallery),
            ),
          ]),
        ),
      ),
    );
    if (source == null) return;
    final picker = ImagePicker();
    final image = await picker.pickImage(source: source, imageQuality: 70);
    if (image == null) return;
    setState(() {
      switch (target) {
        case 'profile':
          _profileImage = File(image.path);
          break;
        case 'nicFront':
          _nicFrontImage = File(image.path);
          break;
        case 'nicBack':
          _nicBackImage = File(image.path);
          break;
        case 'shop':
          _shopImage = File(image.path);
          break;
      }
    });
  }

  Future<void> _pickShopLocation() async {
    final result = await Navigator.of(context).push<Map<String, double>>(
      MaterialPageRoute(
        builder: (_) => ShopLocationPickerScreen(
          initialLatitude: _shopLatitude,
          initialLongitude: _shopLongitude,
        ),
      ),
    );
    if (result != null && mounted) {
      setState(() {
        _shopLatitude = result['latitude'];
        _shopLongitude = result['longitude'];
      });
    }
  }

  Future<Map<String, String>> _encodeImage(File file) async {
    final bytes = await file.readAsBytes();
    final ext = file.path.split('.').last.toLowerCase();
    final mime = ext == 'png' ? 'image/png' : (ext == 'webp' ? 'image/webp' : 'image/jpeg');
    return {'base64': base64Encode(bytes), 'mime': mime};
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
    _emailController.dispose();
    _nicController.dispose();
    _whatsappController.dispose();
    _areaController.dispose();
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
    // A salesman / driver is asked for the same identity documents as a
    // customer BEFORE they can register, so the admin has them in front of
    // them when deciding to approve (they used to be collected only after
    // approval, on a "Complete Your Profile" screen).
    if (_selectedRole != 'customer') {
      if (_nicController.text.trim().isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('NIC number is required.')));
        return;
      }
      if (_profileImage == null) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Profile picture is required.')));
        return;
      }
      if (_nicFrontImage == null) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('NIC front image is required.')));
        return;
      }
      if (_nicBackImage == null) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('NIC back image is required.')));
        return;
      }
    }

    if (_selectedRole == 'customer') {
      if (_businessController.text.trim().isEmpty ||
          _addressController.text.trim().isEmpty ||
          _areaController.text.trim().isEmpty ||
          _emailController.text.trim().isEmpty ||
          _nicController.text.trim().isEmpty ||
          _whatsappController.text.trim().isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('All fields are required.')));
        return;
      }
      if (_profileImage == null) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Profile picture is required.')));
        return;
      }
      if (_nicFrontImage == null) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('NIC front image is required.')));
        return;
      }
      if (_nicBackImage == null) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('NIC back image is required.')));
        return;
      }
      if (_shopImage == null) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Shop photo is required.')));
        return;
      }
      if (_shopLatitude == null || _shopLongitude == null) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Please set your shop location on the map.')));
        return;
      }
    }

    final phone = PhoneNormalizer.normalize(_phoneController.text);

    // Always send the real OTP here, right before the OTP screen — the
    // earlier /auth/send-otp call from login_screen.dart (if any) was only
    // a new-vs-existing check and never dispatches anything for a new
    // number (see auth.controller.js's sendOTPHandler). This is the one
    // true send, happening only now that every field is filled in.
    setState(() => _isLoading = true);
    try {
      final response = await DioClient.instance.post(
        ApiEndpoints.sendOtp,
        data: {'phone': phone, 'forceSend': true},
      );
      if (response.data['success'] != true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(response.data['message'] ?? 'Could not send OTP')));
        }
        return;
      }
      // This number is already registered and still waiting for admin
      // approval — the server sends no OTP in that case.
      if (response.data['data']?['isPending'] == true) {
        if (mounted) context.go('/pending-approval');
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

    Map<String, String>? profileEnc;
    Map<String, String>? nicFrontEnc;
    Map<String, String>? nicBackEnc;
    Map<String, String>? shopEnc;
    profileEnc  = await _encodeImage(_profileImage!);
    nicFrontEnc = await _encodeImage(_nicFrontImage!);
    nicBackEnc  = await _encodeImage(_nicBackImage!);
    if (_selectedRole == 'customer') {
      shopEnc   = await _encodeImage(_shopImage!);
    }

    if (!mounted) return;
    context.push('/otp', extra: {
      'phone':     phone,
      'fullName':  _nameController.text.trim(),
      'companyId': _selectedCity,
      'role':      _selectedRole,
      if (_selectedRole == 'salesman')
        'position': _positionController.text.trim()
      else if (_selectedRole == 'driver')
        'carNumber': _carNumberController.text.trim()
      else ...{
        'businessName':       _businessController.text.trim(),
        'address':            _addressController.text.trim(),
        'area':               _areaController.text.trim(),
        'email':              _emailController.text.trim(),
        'whatsappPhone':      _whatsappController.text.trim(),
        'shopImageBase64':    shopEnc!['base64']!,
        'shopImageMime':      shopEnc['mime']!,
        'shopLatitude':       _shopLatitude!,
        'shopLongitude':      _shopLongitude!,
      },
      // identity documents — every role
      'nicNumber':          _nicController.text.trim(),
      'profileImageBase64': profileEnc['base64']!,
      'profileImageMime':   profileEnc['mime']!,
      'nicFrontBase64':     nicFrontEnc['base64']!,
      'nicFrontMime':       nicFrontEnc['mime']!,
      'nicBackBase64':      nicBackEnc['base64']!,
      'nicBackMime':        nicBackEnc['mime']!,
    });
  }

  static const _fieldBorder = Color(0xFFCED4DA);

  // NIC number + front/back pickers, shown for salesman and driver
  // (a customer's form has its own, in a different order).
  List<Widget> _staffNicFields() => [
        const SizedBox(height: AppSpacing.sm),
        _field(label: 'NIC Number', icon: Icons.badge_outlined, controller: _nicController,
            hint: '42101-1234567-1'),
        const SizedBox(height: AppSpacing.sm),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: _nicImagePicker(
              label: 'NIC Front',
              file: _nicFrontImage,
              onTap: () => _pickImage('nicFront'),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: _nicImagePicker(
              label: 'NIC Back',
              file: _nicBackImage,
              onTap: () => _pickImage('nicBack'),
            ),
          ),
        ]),
      ];

  Widget _shopLocationField() {
    final isSet = _shopLatitude != null && _shopLongitude != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Shop Location', style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
        const SizedBox(height: 6),
        InkWell(
          onTap: _pickShopLocation,
          borderRadius: BorderRadius.circular(AppRadius.base),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(AppRadius.base),
              border: Border.all(color: isSet ? AppColors.success : _fieldBorder),
            ),
            child: Row(children: [
              Icon(isSet ? Icons.location_on : Icons.add_location_alt_outlined,
                  color: isSet ? AppColors.success : AppColors.outline),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  isSet ? 'Location set — tap to change' : 'Tap to set on Google Maps',
                  style: AppTextStyles.bodyMd.copyWith(
                      color: isSet ? AppColors.onSurface : AppColors.outline),
                ),
              ),
            ]),
          ),
        ),
      ],
    );
  }

  Widget _nicImagePicker({required String label, required File? file, required VoidCallback onTap}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
        const SizedBox(height: 6),
        GestureDetector(
          onTap: onTap,
          child: Container(
            width: double.infinity,
            height: 100,
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(AppRadius.base),
              border: Border.all(color: _fieldBorder),
            ),
            clipBehavior: Clip.antiAlias,
            child: file != null
                ? Image.file(file, fit: BoxFit.cover, width: double.infinity)
                : Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.add_photo_alternate_outlined, color: AppColors.outline, size: 24),
                      const SizedBox(height: 4),
                      Text('Tap to upload', style: AppTextStyles.bodySm.copyWith(color: AppColors.outline, fontSize: 11)),
                    ],
                  ),
          ),
        ),
      ],
    );
  }

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
            WaveHeader(title: 'Create Account', onBack: () => goBack(context, '/login')),
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
                                onTap: () => _pickImage('profile'),
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

                      if (_selectedRole == 'salesman') ...[
                        _field(label: 'Position', icon: Icons.badge_outlined, controller: _positionController,
                            hint: 'e.g. Sales Executive, Area Manager'),
                        ..._staffNicFields(),
                      ] else if (_selectedRole == 'driver') ...[
                        _field(label: 'Car Number', icon: Icons.directions_car_outlined, controller: _carNumberController,
                            hint: 'e.g. KHI-1234'),
                        ..._staffNicFields(),
                      ] else ...[
                        _field(label: 'Business Name', icon: Icons.store_outlined, controller: _businessController,
                            hint: 'Shop or company name'),
                        const SizedBox(height: AppSpacing.sm),
                        _field(label: 'Address', icon: Icons.location_on, controller: _addressController,
                            hint: 'Shop address, area'),
                        const SizedBox(height: AppSpacing.sm),
                        _field(label: 'Area', icon: Icons.map_outlined, controller: _areaController,
                            hint: 'e.g. Gulshan, Saddar'),
                        const SizedBox(height: AppSpacing.sm),
                        _field(label: 'Email', icon: Icons.email_outlined, controller: _emailController,
                            hint: 'you@example.com', keyboardType: TextInputType.emailAddress),
                        const SizedBox(height: AppSpacing.sm),
                        _field(label: 'WhatsApp Phone', icon: Icons.chat_outlined, controller: _whatsappController,
                            hint: '03XX XXXXXXX', keyboardType: TextInputType.phone),
                        const SizedBox(height: AppSpacing.sm),
                        _field(label: 'NIC Number', icon: Icons.badge_outlined, controller: _nicController,
                            hint: '42101-1234567-1'),
                        const SizedBox(height: AppSpacing.sm),
                        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Expanded(
                            child: _nicImagePicker(
                              label: 'NIC Front',
                              file: _nicFrontImage,
                              onTap: () => _pickImage('nicFront'),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: _nicImagePicker(
                              label: 'NIC Back',
                              file: _nicBackImage,
                              onTap: () => _pickImage('nicBack'),
                            ),
                          ),
                        ]),
                        const SizedBox(height: AppSpacing.sm),
                        _nicImagePicker(
                          label: 'Shop Photo',
                          file: _shopImage,
                          onTap: () => _pickImage('shop'),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        _shopLocationField(),
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
