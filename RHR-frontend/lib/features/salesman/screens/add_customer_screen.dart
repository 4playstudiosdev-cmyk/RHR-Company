import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/widgets/shop_location_picker_screen.dart';
import '../../../shared/router/app_transitions.dart';
import '../../../shared/utils/input_formatters.dart';

/// Lets a salesman register a new customer/dealer on the spot — the
/// backend auto-assigns the new customer to the creating salesman and
/// their own branch (see customers.controller.js's createCustomer),
/// auto-approved immediately, same as an admin adding one by hand.
class AddCustomerScreen extends StatefulWidget {
  const AddCustomerScreen({super.key});

  @override
  State<AddCustomerScreen> createState() => _AddCustomerScreenState();
}

class _AddCustomerScreenState extends State<AddCustomerScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _shopNameController = TextEditingController();
  final _addressController = TextEditingController();
  final _cityController = TextEditingController();
  final _areaController = TextEditingController();
  final _creditLimitController = TextEditingController();
  final _openingBalanceController = TextEditingController();
  final _nicNumberController = TextEditingController();
  bool _saving = false;
  double? _shopLatitude;
  double? _shopLongitude;
  File? _shopImageFile;
  File? _nicFrontImageFile;
  File? _nicBackImageFile;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _shopNameController.dispose();
    _addressController.dispose();
    _cityController.dispose();
    _areaController.dispose();
    _creditLimitController.dispose();
    _openingBalanceController.dispose();
    _nicNumberController.dispose();
    super.dispose();
  }

  Future<void> _pickImage(String target) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => Container(
        decoration: const BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined, color: AppColors.orange),
              title: const Text('Take Photo'),
              onTap: () => Navigator.of(sheetContext).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined, color: AppColors.orange),
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
        case 'shop':
          _shopImageFile = File(image.path);
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

  Future<void> _pickLocation() async {
    final result = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(builder: (_) => ShopLocationPickerScreen(
        initialLatitude: _shopLatitude,
        initialLongitude: _shopLongitude,
      )),
    );
    if (result != null && mounted) {
      setState(() {
        _shopLatitude = (result['latitude'] as num).toDouble();
        _shopLongitude = (result['longitude'] as num).toDouble();
      });
    }
  }

  // Every one of these mirrors customers.controller.js's own
  // REQUIRED_PROFILE_FIELDS (isProfileComplete) — a customer registered
  // here with any of them missing would immediately be flagged
  // incomplete anyway, so Add Customer requires them up front instead
  // of letting a salesman create a half-filled record.
  bool _validate() {
    final checks = <String, bool>{
      'Full Name': _nameController.text.trim().isNotEmpty,
      'Phone Number': _phoneController.text.trim().isNotEmpty,
      'Shop Name': _shopNameController.text.trim().isNotEmpty,
      'Shop Address': _addressController.text.trim().isNotEmpty,
      'City': _cityController.text.trim().isNotEmpty,
      'Area': _areaController.text.trim().isNotEmpty,
      'Shop Location': _shopLatitude != null && _shopLongitude != null,
      'NIC Number': _nicNumberController.text.trim().isNotEmpty,
      'Shop Photo': _shopImageFile != null,
      'NIC Front Image': _nicFrontImageFile != null,
      'NIC Back Image': _nicBackImageFile != null,
    };
    for (final entry in checks.entries) {
      if (!entry.value) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${entry.key} is required.')));
        return false;
      }
    }
    return true;
  }

  Future<void> _save() async {
    if (!_validate()) return;
    setState(() => _saving = true);
    try {
      // Upload whichever photos were picked before submitting — same
      // buckets the customer's own Complete Profile flow uses, so these
      // show up identically in the admin desktop either way.
      String? shopImageUrl;
      String? nicFrontUrl;
      String? nicBackUrl;
      if (_shopImageFile != null) shopImageUrl = await _uploadImage(_shopImageFile!, 'shop-photos');
      if (_nicFrontImageFile != null) nicFrontUrl = await _uploadImage(_nicFrontImageFile!, 'nic-images');
      if (_nicBackImageFile != null) nicBackUrl = await _uploadImage(_nicBackImageFile!, 'nic-images');

      final res = await DioClient.instance.post(ApiEndpoints.customers, data: {
        'full_name': _nameController.text.trim(),
        'phone': _phoneController.text.trim(),
        'shop_name': _shopNameController.text.trim(),
        'shop_address': _addressController.text.trim(),
        'city': _cityController.text.trim(),
        'area': _areaController.text.trim(),
        'shop_latitude': _shopLatitude,
        'shop_longitude': _shopLongitude,
        if (_creditLimitController.text.trim().isNotEmpty)
          'credit_limit': double.tryParse(_creditLimitController.text.trim()),
        'nic_number': _nicNumberController.text.trim(),
        if (shopImageUrl != null) 'shop_image_url': shopImageUrl,
        if (nicFrontUrl != null) 'nic_image_url': nicFrontUrl,
        if (nicBackUrl != null) 'nic_back_image_url': nicBackUrl,
      });
      if (res.data['success'] == true) {
        final newCustomerId = res.data['data']?['id'] as String?;
        final openingAmount = double.tryParse(_openingBalanceController.text.trim());
        if (newCustomerId != null && openingAmount != null && openingAmount > 0) {
          try {
            await DioClient.instance.post(ApiEndpoints.openingBalances, data: {
              'entity_type': 'customer',
              'entity_id': newCustomerId,
              'entity_name': _nameController.text.trim(),
              'balance_type': 'debit',
              'amount': openingAmount,
              'notes': 'Opening balance at customer creation',
            });
          } catch (e) {
            debugPrint('Opening balance save failed: $e');
          }
        }
        if (mounted) await showSuccessCheck(context, message: 'Customer Added!');
        if (mounted) context.pop(true);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res.data['message'] ?? 'Failed')));
      }
    } catch (e) {
      if (mounted) {
        final backendMsg = e is DioException ? (e.response?.data?['message'] as String?) : null;
        final msg = backendMsg ?? (e.toString().contains('already exists')
            ? 'A customer with this phone number already exists.'
            : 'Error: $e');
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _field(String label, TextEditingController controller,
      {bool required = false, TextInputType? keyboardType, IconData? icon, List<TextInputFormatter>? inputFormatters, String? hint}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(required ? '$label *' : label,
            style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.navy, fontSize: 13)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          inputFormatters: inputFormatters,
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: icon != null ? Icon(icon, color: AppColors.orange, size: 20) : null,
            filled: true,
            fillColor: AppColors.warmGrey,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          ),
        ),
      ]),
    );
  }

  Widget _imagePicker({required String label, required File? file, required VoidCallback onTap}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.navy)),
        const SizedBox(height: 6),
        GestureDetector(
          onTap: onTap,
          child: Container(
            width: double.infinity,
            height: 110,
            decoration: BoxDecoration(color: AppColors.warmGrey, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.disabled)),
            clipBehavior: Clip.antiAlias,
            child: file != null
                ? Image.file(file, fit: BoxFit.cover, width: double.infinity)
                : Column(mainAxisAlignment: MainAxisAlignment.center, children: const [
                    Icon(Icons.add_photo_alternate_outlined, color: AppColors.steelBlue, size: 26),
                    SizedBox(height: 6),
                    Text('Tap to upload', style: TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                  ]),
          ),
        ),
      ],
    );
  }

  Widget _sectionCard({required String title, required IconData icon, required List<Widget> children}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10, offset: const Offset(0, 3))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: AppColors.orange.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(9)),
            child: Icon(icon, color: AppColors.orange, size: 18),
          ),
          const SizedBox(width: 10),
          Text(title, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 15)),
        ]),
        const SizedBox(height: 16),
        ...children,
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: () => goBack(context, '/salesman-dashboard')),
        title: const Text('Add Customer', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.navy,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(color: AppColors.orange.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.person_add_alt_1, color: AppColors.orange, size: 24),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('New Customer', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                  SizedBox(height: 3),
                  Text('They will be auto-approved and linked to you', style: TextStyle(color: Colors.white60, fontSize: 12)),
                ]),
              ),
            ]),
          ),
          _sectionCard(title: 'Customer Details', icon: Icons.badge_outlined, children: [
            _field('Full Name', _nameController, required: true, icon: Icons.person_outline),
            _field('Phone Number', _phoneController, required: true, keyboardType: TextInputType.phone, icon: Icons.phone_outlined),
          ]),
          _sectionCard(title: 'Shop Details', icon: Icons.storefront_outlined, children: [
            _field('Shop Name', _shopNameController, required: true, icon: Icons.store_outlined),
            _field('Shop Address', _addressController, required: true, icon: Icons.home_outlined),
            _field('City', _cityController, required: true, icon: Icons.location_city_outlined),
            _field('Area', _areaController, required: true, icon: Icons.map_outlined),
            OutlinedButton.icon(
              onPressed: _pickLocation,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.orange,
                side: const BorderSide(color: AppColors.orange),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              icon: const Icon(Icons.my_location, size: 18),
              label: Text(_shopLatitude != null ? 'Update Location' : 'Set Shop Location'),
            ),
            if (_shopLatitude != null && _shopLongitude != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(children: [
                  const Icon(Icons.check_circle, size: 14, color: AppColors.success),
                  const SizedBox(width: 6),
                  Text(
                    'Location captured (${_shopLatitude!.toStringAsFixed(5)}, ${_shopLongitude!.toStringAsFixed(5)})',
                    style: const TextStyle(color: AppColors.success, fontSize: 11),
                  ),
                ]),
              ),
            const SizedBox(height: 14),
            _imagePicker(label: 'Shop Photo *', file: _shopImageFile, onTap: () => _pickImage('shop')),
          ]),
          _sectionCard(title: 'Identification', icon: Icons.badge_outlined, children: [
            _field('NIC Number', _nicNumberController, required: true, icon: Icons.badge_outlined, hint: '42101-1234567-1',
                keyboardType: TextInputType.number, inputFormatters: [CnicInputFormatter()]),
            Row(children: [
              Expanded(child: _imagePicker(label: 'NIC Front *', file: _nicFrontImageFile, onTap: () => _pickImage('nicFront'))),
              const SizedBox(width: 12),
              Expanded(child: _imagePicker(label: 'NIC Back *', file: _nicBackImageFile, onTap: () => _pickImage('nicBack'))),
            ]),
          ]),
          _sectionCard(title: 'Account Setup (optional)', icon: Icons.account_balance_wallet_outlined, children: [
            _field('Credit Limit (PKR)', _creditLimitController,
                keyboardType: TextInputType.number, icon: Icons.speed_outlined),
            _field('Opening Balance — Amount Owed (PKR)', _openingBalanceController,
                keyboardType: TextInputType.number, icon: Icons.account_balance_outlined),
            const Text(
              'Both are visible to the customer and in the admin panel. Leave blank for no limit / a fresh account.',
              style: TextStyle(color: AppColors.steelBlue, fontSize: 11),
            ),
          ]),
          const SizedBox(height: 4),
          RHRButton(text: 'Save Customer', onPressed: _save, isLoading: _saving),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}
