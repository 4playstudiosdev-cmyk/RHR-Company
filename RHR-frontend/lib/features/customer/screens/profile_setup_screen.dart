import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/wave_header.dart';

/// Forced on a customer's first login once their profile is missing any
/// required field (see customers.controller.js's isProfileComplete), and
/// also reachable any time after via Settings → Edit Profile. All 9
/// fields — full name, email, NIC number, shop name, shop address,
/// WhatsApp phone, profile picture, NIC front image, NIC back image —
/// are required to save.
class ProfileSetupScreen extends StatefulWidget {
  final bool forced;
  const ProfileSetupScreen({super.key, this.forced = false});

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  final _nameController     = TextEditingController();
  final _emailController    = TextEditingController();
  final _nicController      = TextEditingController();
  final _shopNameController = TextEditingController();
  final _addressController  = TextEditingController();
  final _whatsappController = TextEditingController();

  File? _profileImageFile;
  File? _nicFrontImageFile;
  File? _nicBackImageFile;
  String? _existingProfileUrl;
  String? _existingNicFrontUrl;
  String? _existingNicBackUrl;

  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadExisting();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _nicController.dispose();
    _shopNameController.dispose();
    _addressController.dispose();
    _whatsappController.dispose();
    super.dispose();
  }

  Future<void> _loadExisting() async {
    try {
      final res = await DioClient.instance.get(ApiEndpoints.myProfile);
      if (res.data['success'] == true) {
        final data = res.data['data'] as Map<String, dynamic>;
        _nameController.text     = (data['full_name'] as String?) ?? '';
        _emailController.text    = (data['email'] as String?) ?? '';
        _nicController.text      = (data['nic_number'] as String?) ?? '';
        _shopNameController.text = (data['shop_name'] as String?) ?? '';
        _addressController.text  = (data['shop_address'] as String?) ?? '';
        _whatsappController.text = (data['whatsapp_phone'] as String?) ?? '';
        _existingProfileUrl  = data['profile_photo_url'] as String?;
        _existingNicFrontUrl = data['nic_image_url'] as String?;
        _existingNicBackUrl  = data['nic_back_image_url'] as String?;
      }
    } catch (e) {
      debugPrint('Profile load error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickImage(String target) async {
    final picker = ImagePicker();
    final image = await picker.pickImage(source: ImageSource.gallery, imageQuality: 70);
    if (image == null) return;
    setState(() {
      switch (target) {
        case 'profile':
          _profileImageFile = File(image.path);
          break;
        case 'nicFront':
          _nicFrontImageFile = File(image.path);
          break;
        case 'nicBack':
          _nicBackImageFile = File(image.path);
          break;
      }
    });
  }

  Future<String> _uploadImage(File file, String bucket) async {
    final bytes = await file.readAsBytes();
    final ext = file.path.split('.').last.toLowerCase();
    final mimeType = ext == 'png' ? 'image/png' : (ext == 'webp' ? 'image/webp' : 'image/jpeg');
    final res = await DioClient.instance.post(ApiEndpoints.storageUpload, data: {
      'bucket':     bucket,
      'fileName':   '${DateTime.now().millisecondsSinceEpoch}.$ext',
      'fileBase64': base64Encode(bytes),
      'mimeType':   mimeType,
    });
    if (res.data['success'] == true) {
      return res.data['data']['url'] as String;
    }
    throw Exception(res.data['message'] ?? 'Image upload failed');
  }

  Future<void> _save() async {
    if (_nameController.text.trim().isEmpty ||
        _emailController.text.trim().isEmpty ||
        _nicController.text.trim().isEmpty ||
        _shopNameController.text.trim().isEmpty ||
        _addressController.text.trim().isEmpty ||
        _whatsappController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('All fields are required.')));
      return;
    }
    if (_profileImageFile == null && _existingProfileUrl == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile picture is required.')));
      return;
    }
    if (_nicFrontImageFile == null && _existingNicFrontUrl == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('NIC front image is required.')));
      return;
    }
    if (_nicBackImageFile == null && _existingNicBackUrl == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('NIC back image is required.')));
      return;
    }

    setState(() => _saving = true);
    try {
      final profileUrl = _profileImageFile != null
          ? await _uploadImage(_profileImageFile!, 'profile-photos')
          : _existingProfileUrl!;
      final nicFrontUrl = _nicFrontImageFile != null
          ? await _uploadImage(_nicFrontImageFile!, 'nic-images')
          : _existingNicFrontUrl!;
      final nicBackUrl = _nicBackImageFile != null
          ? await _uploadImage(_nicBackImageFile!, 'nic-images')
          : _existingNicBackUrl!;

      final res = await DioClient.instance.patch(ApiEndpoints.myProfile, data: {
        'full_name':          _nameController.text.trim(),
        'email':              _emailController.text.trim(),
        'nic_number':         _nicController.text.trim(),
        'shop_name':          _shopNameController.text.trim(),
        'shop_address':       _addressController.text.trim(),
        'whatsapp_phone':     _whatsappController.text.trim(),
        'profile_photo_url':  profileUrl,
        'nic_image_url':      nicFrontUrl,
        'nic_back_image_url': nicBackUrl,
      });

      if (res.data['success'] == true) {
        await SecureStorage.saveProfileComplete(true);
        await SecureStorage.saveFullName(_nameController.text.trim());
        if (mounted) context.go('/home');
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(res.data['message'] ?? 'Failed to save profile')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
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

  // locked: true once this NIC side already has a saved image — a NIC
  // can't be re-uploaded after the fact (identity document, not editable
  // like the other fields), so it renders read-only with no tap target.
  Widget _imagePicker({
    required String label,
    required File? file,
    required String? existingUrl,
    required VoidCallback onTap,
    bool locked = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTextStyles.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
        const SizedBox(height: 6),
        GestureDetector(
          onTap: locked ? null : onTap,
          child: Container(
            width: double.infinity,
            height: 120,
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(AppRadius.base),
              border: Border.all(color: _fieldBorder),
            ),
            clipBehavior: Clip.antiAlias,
            child: file != null
                ? Image.file(file, fit: BoxFit.cover, width: double.infinity)
                : (existingUrl != null
                    ? Stack(fit: StackFit.expand, children: [
                        Image.network(existingUrl, fit: BoxFit.cover),
                        if (!locked)
                          Container(
                            alignment: Alignment.bottomRight,
                            padding: const EdgeInsets.all(6),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.55),
                                borderRadius: BorderRadius.circular(AppRadius.full),
                              ),
                              child: const Text('Tap to change',
                                  style: TextStyle(color: Colors.white, fontSize: 11)),
                            ),
                          )
                        else
                          Container(
                            alignment: Alignment.bottomRight,
                            padding: const EdgeInsets.all(6),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.55),
                                borderRadius: BorderRadius.circular(AppRadius.full),
                              ),
                              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                                Icon(Icons.lock, color: Colors.white, size: 11),
                                SizedBox(width: 4),
                                Text('Locked', style: TextStyle(color: Colors.white, fontSize: 11)),
                              ]),
                            ),
                          ),
                      ])
                    : Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.add_photo_alternate_outlined, color: AppColors.outline, size: 28),
                          const SizedBox(height: 6),
                          Text('Tap to upload', style: AppTextStyles.bodySm.copyWith(color: AppColors.outline)),
                        ],
                      )),
          ),
        ),
      ],
    );
  }

  Widget _circleImagePicker({
    required File? file,
    required String? existingUrl,
    required VoidCallback onTap,
  }) {
    return Center(
      child: Stack(children: [
        CircleAvatar(
          radius: 48,
          backgroundColor: AppColors.surfaceContainerLow,
          backgroundImage: file != null
              ? FileImage(file)
              : (existingUrl != null ? NetworkImage(existingUrl) as ImageProvider : null),
          child: (file == null && existingUrl == null)
              ? const Icon(Icons.person, size: 44, color: AppColors.secondary)
              : null,
        ),
        Positioned(
          bottom: 0, right: 0,
          child: GestureDetector(
            onTap: onTap,
            child: Container(
              width: 32, height: 32,
              decoration: BoxDecoration(
                color: AppColors.primary,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
              ),
              child: const Icon(Icons.camera_alt, color: Colors.white, size: 16),
            ),
          ),
        ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !widget.forced,
      child: Scaffold(
        backgroundColor: AppColors.surface,
        body: SafeArea(
          top: false,
          child: Column(
            children: [
              WaveHeader(
                title: 'Complete Your Profile',
                onBack: widget.forced ? null : () => context.pop(),
              ),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                    : SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(
                            AppSpacing.marginMobile, AppSpacing.md, AppSpacing.marginMobile, AppSpacing.lg),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          if (widget.forced)
                            Container(
                              padding: const EdgeInsets.all(AppSpacing.sm),
                              margin: const EdgeInsets.only(bottom: AppSpacing.md),
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
                                      'Please complete your profile to continue — all fields are required.',
                                      style: AppTextStyles.bodySm.copyWith(color: AppColors.onPrimaryFixed),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          Container(
                            padding: const EdgeInsets.all(AppSpacing.md),
                            decoration: BoxDecoration(
                              color: AppColors.surfaceContainerLowest,
                              borderRadius: BorderRadius.circular(AppRadius.lg),
                              border: Border.all(color: AppColors.outlineVariant),
                            ),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                              _circleImagePicker(
                                file: _profileImageFile,
                                existingUrl: _existingProfileUrl,
                                onTap: () => _pickImage('profile'),
                              ),
                              const SizedBox(height: AppSpacing.sm),
                              _field(label: 'Full Name *', icon: Icons.person, controller: _nameController, hint: 'Enter your full name'),
                              const SizedBox(height: AppSpacing.sm),
                              _field(label: 'Email *', icon: Icons.email_outlined, controller: _emailController,
                                  hint: 'you@example.com', keyboardType: TextInputType.emailAddress),
                              const SizedBox(height: AppSpacing.sm),
                              _field(label: 'NIC Number *', icon: Icons.badge_outlined, controller: _nicController,
                                  hint: '42101-1234567-1'),
                              const SizedBox(height: AppSpacing.sm),
                              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Expanded(
                                  child: _imagePicker(
                                    label: 'NIC Front *',
                                    file: _nicFrontImageFile,
                                    existingUrl: _existingNicFrontUrl,
                                    onTap: () => _pickImage('nicFront'),
                                    locked: _existingNicFrontUrl != null,
                                  ),
                                ),
                                const SizedBox(width: AppSpacing.sm),
                                Expanded(
                                  child: _imagePicker(
                                    label: 'NIC Back *',
                                    file: _nicBackImageFile,
                                    existingUrl: _existingNicBackUrl,
                                    onTap: () => _pickImage('nicBack'),
                                    locked: _existingNicBackUrl != null,
                                  ),
                                ),
                              ]),
                              const SizedBox(height: AppSpacing.sm),
                              _field(label: 'Shop Name *', icon: Icons.store_outlined, controller: _shopNameController,
                                  hint: 'Shop or company name'),
                              const SizedBox(height: AppSpacing.sm),
                              _field(label: 'Shop Address *', icon: Icons.location_on, controller: _addressController,
                                  hint: 'Shop address, area'),
                              const SizedBox(height: AppSpacing.sm),
                              _field(label: 'WhatsApp Phone *', icon: Icons.chat_outlined, controller: _whatsappController,
                                  hint: '03XX XXXXXXX', keyboardType: TextInputType.phone),
                              const SizedBox(height: AppSpacing.md),
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton(
                                  onPressed: _saving ? null : _save,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppColors.primary,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(vertical: 16),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                                  ),
                                  child: _saving
                                      ? const SizedBox(width: 22, height: 22,
                                          child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                                      : Text('Save Profile', style: AppTextStyles.labelMd.copyWith(color: Colors.white)),
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
      ),
    );
  }
}
