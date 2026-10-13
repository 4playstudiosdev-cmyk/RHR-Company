import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/router/app_transitions.dart';
import '../../../shared/utils/input_formatters.dart';

/// Forced on a salesman's first login once their profile is missing any
/// required field (see salesmen.routes.js's isProfileComplete), and also
/// reachable any time after via My Profile → Edit Profile. Required:
/// salesman photo + name, NIC number, NIC front/back images, phone.
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
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Your photo is required.')));
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

      final res = await DioClient.instance.patch(ApiEndpoints.salesmanMyProfile, data: {
        'full_name':          _nameController.text.trim(),
        // Canonical, no spaces — same `phone` column OTP login matches
        // against (see driver_profile_setup_screen.dart's identical fix).
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

  static const _fieldBorder = Color(0xFFCED4DA);

  Widget _field({
    required String label,
    required IconData icon,
    required TextEditingController controller,
    String? hint,
    TextInputType? keyboardType,
    List<TextInputFormatter>? inputFormatters,
    String? prefixText,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.steelBlue)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          inputFormatters: inputFormatters,
          style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w600),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: AppColors.steelBlue.withValues(alpha: 0.55), fontWeight: FontWeight.normal),
            prefixText: prefixText,
            prefixStyle: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w600),
            prefixIcon: Icon(icon, color: AppColors.steelBlue),
            filled: true,
            fillColor: AppColors.white,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: _fieldBorder)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: _fieldBorder)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.navy, width: 2)),
            contentPadding: const EdgeInsets.symmetric(vertical: 14),
          ),
        ),
      ],
    );
  }

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
        Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.steelBlue)),
        const SizedBox(height: 6),
        GestureDetector(
          onTap: locked ? null : onTap,
          child: Container(
            width: double.infinity,
            height: 120,
            decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: _fieldBorder)),
            clipBehavior: Clip.antiAlias,
            child: file != null
                ? Image.file(file, fit: BoxFit.cover, width: double.infinity)
                : (existingUrl != null
                    ? Stack(fit: StackFit.expand, children: [
                        Image.network(existingUrl, fit: BoxFit.cover),
                        Container(
                          alignment: Alignment.bottomRight,
                          padding: const EdgeInsets.all(6),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(20)),
                            child: Text(locked ? 'Locked' : 'Tap to change', style: const TextStyle(color: Colors.white, fontSize: 11)),
                          ),
                        ),
                      ])
                    : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        const Icon(Icons.add_photo_alternate_outlined, color: AppColors.steelBlue, size: 28),
                        const SizedBox(height: 6),
                        const Text('Tap to upload', style: TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                      ])),
          ),
        ),
      ],
    );
  }

  Widget _circleImagePicker({required File? file, required String? existingUrl, required VoidCallback onTap}) {
    return Center(
      child: Stack(children: [
        CircleAvatar(
          radius: 48,
          backgroundColor: AppColors.warmGrey,
          backgroundImage: file != null ? FileImage(file) : (existingUrl != null ? NetworkImage(existingUrl) as ImageProvider : null),
          child: (file == null && existingUrl == null) ? const Icon(Icons.person, size: 44, color: AppColors.steelBlue) : null,
        ),
        Positioned(
          bottom: 0, right: 0,
          child: GestureDetector(
            onTap: onTap,
            child: Container(
              width: 32, height: 32,
              decoration: BoxDecoration(color: AppColors.orange, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
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
        backgroundColor: AppColors.warmGrey,
        appBar: AppBar(
          backgroundColor: AppColors.navy,
          automaticallyImplyLeading: false,
          leading: widget.forced ? null : IconButton(
              icon: const Icon(Icons.arrow_back, color: Colors.white),
              onPressed: () => goBack(context, '/salesman-profile')),
          title: const Text('Complete Your Profile', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
            : SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  if (widget.forced)
                    Container(
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(color: AppColors.orange.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.orange)),
                      child: const Row(children: [
                        Icon(Icons.info, color: AppColors.orange, size: 20),
                        SizedBox(width: 10),
                        Expanded(child: Text('Please complete your profile to continue — all fields are required.', style: TextStyle(fontSize: 13, color: AppColors.navy))),
                      ]),
                    ),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)]),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      _circleImagePicker(file: _profileImageFile, existingUrl: _existingProfileUrl, onTap: () => _pickImage('profile')),
                      const SizedBox(height: 14),
                      _field(label: 'Full Name *', icon: Icons.person, controller: _nameController, hint: 'Enter your full name'),
                      const SizedBox(height: 12),
                      _field(label: 'Phone Number *', icon: Icons.phone_outlined, controller: _phoneController, hint: '310 2110584',
                          keyboardType: TextInputType.phone, prefixText: '+92 ', inputFormatters: [PhoneLocalInputFormatter()]),
                      const SizedBox(height: 12),
                      _field(label: 'NIC Number *', icon: Icons.badge_outlined, controller: _nicController, hint: '42101-1234567-1',
                          keyboardType: TextInputType.number, inputFormatters: [CnicInputFormatter()]),
                      const SizedBox(height: 12),
                      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Expanded(child: _imagePicker(label: 'NIC Front *', file: _nicFrontImageFile, existingUrl: _existingNicFrontUrl, onTap: () => _pickImage('nicFront'), locked: _existingNicFrontUrl != null)),
                        const SizedBox(width: 12),
                        Expanded(child: _imagePicker(label: 'NIC Back *', file: _nicBackImageFile, existingUrl: _existingNicBackUrl, onTap: () => _pickImage('nicBack'), locked: _existingNicBackUrl != null)),
                      ]),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _saving ? null : _save,
                          style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                          child: _saving
                              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                              : const Text('Save Profile', style: TextStyle(fontWeight: FontWeight.bold)),
                        ),
                      ),
                    ]),
                  ),
                ]),
              ),
      ),
    );
  }
}
