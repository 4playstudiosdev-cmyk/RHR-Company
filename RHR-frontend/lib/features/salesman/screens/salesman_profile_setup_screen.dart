import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/router/app_transitions.dart';
import '../../../shared/utils/input_formatters.dart';
import '../../../shared/widgets/premium_ui.dart';

class SalesmanProfileSetupScreen extends StatefulWidget {
  final bool forced;
  const SalesmanProfileSetupScreen({super.key, this.forced = false});

  @override
  State<SalesmanProfileSetupScreen> createState() => _SalesmanProfileSetupScreenState();
}

class _SalesmanProfileSetupScreenState extends State<SalesmanProfileSetupScreen> {
  final _nameController  = TextEditingController();
  final _phoneController = TextEditingController();
  final _nicController   = TextEditingController();

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
    _phoneController.dispose();
    _nicController.dispose();
    super.dispose();
  }

  Future<void> _loadExisting() async {
    try {
      final res = await DioClient.instance.get(ApiEndpoints.salesmanMyProfile);
      if (res.data['success'] == true) {
        final data = res.data['data'] as Map<String, dynamic>;
        _nameController.text  = (data['full_name'] as String?) ?? '';
        _phoneController.text = formatLocalPhone(localPhoneDigits(data['phone'] as String?));
        _nicController.text   = (data['nic_number'] as String?) ?? '';
        _existingProfileUrl  = data['profile_photo_url'] as String?;
        _existingNicFrontUrl = data['nic_image_url'] as String?;
        _existingNicBackUrl  = data['nic_back_image_url'] as String?;
      }
    } catch (e) {
      debugPrint('Salesman profile load error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickImage(String target) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2)),
            ),
            ListTile(
              leading: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.camera_alt_rounded, color: kNavy, size: 20),
              ),
              title: const Text('Take Photo', style: TextStyle(fontWeight: FontWeight.w600, color: kNavy)),
              onTap: () => Navigator.of(sheetContext).pop(ImageSource.camera),
            ),
            ListTile(
              leading: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.photo_library_rounded, color: kNavy, size: 20),
              ),
              title: const Text('Choose from Gallery', style: TextStyle(fontWeight: FontWeight.w600, color: kNavy)),
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
    if (_nameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Full Name is required.')));
      return;
    }
    if (_phoneController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Phone Number is required.')));
      return;
    }
    if (_nicController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('NIC Number is required.')));
      return;
    }
    if (_profileImageFile == null && _existingProfileUrl == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Your photo is required.')));
      return;
    }
    if (_nicFrontImageFile == null && _existingNicFrontUrl == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('NIC front image is required.')));
      return;
    }
    if (_nicBackImageFile == null && _existingNicBackUrl == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('NIC back image is required.')));
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

      final res = await DioClient.instance.patch(ApiEndpoints.salesmanMyProfile, data: {
        'full_name':          _nameController.text.trim(),
        'phone':              '+92${_phoneController.text.replaceAll(' ', '').trim()}',
        'nic_number':         _nicController.text.trim(),
        'profile_photo_url':  profileUrl,
        'nic_image_url':      nicFrontUrl,
        'nic_back_image_url': nicBackUrl,
      });

      if (res.data['success'] == true) {
        await SecureStorage.saveSalesmanProfileComplete(true);
        await SecureStorage.saveFullName(_nameController.text.trim());
        if (mounted) context.go('/salesman-dashboard');
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

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !widget.forced,
      child: Scaffold(
        backgroundColor: kCardBg,
        appBar: premiumAppBar(
          'Complete Your Profile',
          subtitle: 'All fields are required',
          onBack: widget.forced ? null : () => goBack(context, '/salesman-profile'),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator(color: kNavy))
            : SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  if (widget.forced)
                    Container(
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: kAmber.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: kAmber.withValues(alpha: 0.4)),
                      ),
                      child: const Row(children: [
                        Icon(Icons.info_outline_rounded, color: kAmber, size: 18),
                        SizedBox(width: 10),
                        Expanded(child: Text('Please complete your profile to continue — all fields are required.',
                            style: TextStyle(fontSize: 13, color: kNavy))),
                      ]),
                    ),

                  // Profile photo
                  Center(child: Stack(children: [
                    CircleAvatar(
                      radius: 52,
                      backgroundColor: kNavy.withValues(alpha: 0.07),
                      backgroundImage: _profileImageFile != null
                          ? FileImage(_profileImageFile!)
                          : (_existingProfileUrl != null ? NetworkImage(_existingProfileUrl!) as ImageProvider : null),
                      child: (_profileImageFile == null && _existingProfileUrl == null)
                          ? const Icon(Icons.person, size: 48, color: kTextMuted) : null,
                    ),
                    Positioned(
                      bottom: 0, right: 0,
                      child: GestureDetector(
                        onTap: () => _pickImage('profile'),
                        child: Container(
                          width: 34, height: 34,
                          decoration: BoxDecoration(
                            color: kNavy, shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 2),
                            boxShadow: [BoxShadow(color: kNavy.withValues(alpha: 0.3), blurRadius: 6)],
                          ),
                          child: const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 16),
                        ),
                      ),
                    ),
                  ])),
                  const SizedBox(height: 20),

                  // Form fields
                  PremiumCard(child: Column(children: [
                    PremiumInput(
                      label: 'Full Name *',
                      hint: 'Enter your full name',
                      controller: _nameController,
                      prefixIcon: Icons.person_outline_rounded,
                    ),
                    const SizedBox(height: 14),
                    PremiumInput(
                      label: 'Phone Number *',
                      hint: '310 2110584',
                      controller: _phoneController,
                      keyboardType: TextInputType.phone,
                      prefixIcon: Icons.phone_outlined,
                      inputFormatters: [PhoneLocalInputFormatter()],
                    ),
                    const SizedBox(height: 14),
                    PremiumInput(
                      label: 'NIC Number *',
                      hint: '42101-1234567-1',
                      controller: _nicController,
                      keyboardType: TextInputType.number,
                      prefixIcon: Icons.badge_outlined,
                      inputFormatters: [CnicInputFormatter()],
                    ),
                  ])),
                  const SizedBox(height: 16),

                  // NIC images
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(child: _nicImagePicker(
                      label: 'NIC Front *',
                      file: _nicFrontImageFile,
                      existingUrl: _existingNicFrontUrl,
                      onTap: () => _pickImage('nicFront'),
                      locked: _existingNicFrontUrl != null,
                    )),
                    const SizedBox(width: 12),
                    Expanded(child: _nicImagePicker(
                      label: 'NIC Back *',
                      file: _nicBackImageFile,
                      existingUrl: _existingNicBackUrl,
                      onTap: () => _pickImage('nicBack'),
                      locked: _existingNicBackUrl != null,
                    )),
                  ]),
                  const SizedBox(height: 24),

                  PremiumButton(
                    text: 'Save Profile',
                    onPressed: _save,
                    isLoading: _saving,
                    icon: Icons.check_rounded,
                  ),
                  const SizedBox(height: 20),
                ]),
              ),
      ),
    );
  }

  Widget _nicImagePicker({
    required String label,
    required File? file,
    required String? existingUrl,
    required VoidCallback onTap,
    bool locked = false,
  }) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(color: kNavy, fontSize: 13, fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      GestureDetector(
        onTap: locked ? null : onTap,
        child: Container(
          width: double.infinity,
          height: 110,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE0E5EF)),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)],
          ),
          clipBehavior: Clip.antiAlias,
          child: file != null
              ? Image.file(file, fit: BoxFit.cover)
              : (existingUrl != null
                  ? Stack(fit: StackFit.expand, children: [
                      Image.network(existingUrl, fit: BoxFit.cover),
                      Container(
                        alignment: Alignment.bottomRight,
                        padding: const EdgeInsets.all(6),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(20)),
                          child: Text(locked ? 'Locked' : 'Tap to change',
                              style: const TextStyle(color: Colors.white, fontSize: 11)),
                        ),
                      ),
                    ])
                  : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(Icons.add_photo_alternate_outlined, color: kNavy.withValues(alpha: 0.4), size: 28),
                      const SizedBox(height: 6),
                      const Text('Tap to upload', style: TextStyle(color: kTextMuted, fontSize: 12)),
                    ])),
        ),
      ),
    ]);
  }
}
