import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import '../../../core/storage/secure_storage.dart';
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
  // A driver with sales access adds customers too: the customer becomes that
  // driver's own, and a salesman can optionally be assigned as well.
  bool _isDriver = false;
  List<Map<String, dynamic>> _salesmen = [];
  String? _salesmanId;
  double? _shopLatitude;
  double? _shopLongitude;
  File? _shopImageFile;
  File? _nicFrontImageFile;
  File? _nicBackImageFile;

  // 3-step wizard — Details -> Pricing -> Review, same shape as the
  // admin desktop's own Add Customer wizard (Customers.js's
  // handleSaveNewCustomerWithPricing / addStep). Since the customer
  // doesn't exist yet, custom prices are staged locally in
  // _customPrices and only actually applied (via PUT
  // /customers/:id/pricing/:productId, looped) once step 3's final
  // submit has created the customer and has a real id to target.
  int _step = 1;
  List<Map<String, dynamic>> _categories = [];
  List<Map<String, dynamic>> _products = [];
  bool _loadingProducts = false;
  String _productSearch = '';
  final Map<String, String> _customPrices = {};

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

  Future<void> _goToPricingStep() async {
    if (!_validateStep1()) return;
    setState(() => _step = 2);
    if (_products.isNotEmpty) return;
    setState(() => _loadingProducts = true);
    try {
      final results = await Future.wait([
        DioClient.instance.get(ApiEndpoints.categories),
        DioClient.instance.get(ApiEndpoints.products, queryParameters: {'limit': 200}),
      ]);
      if (results[0].data['success'] == true) {
        _categories = List<Map<String, dynamic>>.from(results[0].data['data'] ?? []);
      }
      if (results[1].data['success'] == true) {
        final raw = results[1].data['data'];
        _products = List<Map<String, dynamic>>.from(
            raw is Map ? (raw['products'] ?? raw['data'] ?? []) : raw ?? []);
      }
    } catch (e) {
      debugPrint('Products load error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to load products.')));
      }
    } finally {
      if (mounted) setState(() => _loadingProducts = false);
    }
  }

  String _categoryName(String? categoryId) {
    if (categoryId == null) return '';
    final match = _categories.where((c) => c['id'] == categoryId);
    return match.isEmpty ? '' : (match.first['name'] as String? ?? '');
  }

  List<Map<String, dynamic>> get _visibleProducts {
    if (_productSearch.trim().isEmpty) return _products;
    final q = _productSearch.trim().toLowerCase();
    return _products.where((p) {
      final name = (p['name'] as String? ?? '').toLowerCase();
      final category = _categoryName(p['category_id'] as String?).toLowerCase();
      return name.contains(q) || category.contains(q);
    }).toList();
  }

  // Every one of these mirrors customers.controller.js's own
  // REQUIRED_PROFILE_FIELDS (isProfileComplete) — a customer registered
  // here with any of them missing would immediately be flagged
  // incomplete anyway, so Add Customer requires them up front instead
  // of letting a salesman create a half-filled record. Credit Limit and
  // Opening Balance aren't part of that backend list but are required
  // here too — a number must actually be entered (0 is fine), not left
  // blank.
  bool _validateStep1() {
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
      'Credit Limit': double.tryParse(_creditLimitController.text.trim()) != null,
      'Opening Balance': double.tryParse(_openingBalanceController.text.trim()) != null,
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
    if (!_validateStep1()) return;
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
        if (_isDriver && _salesmanId != null) 'salesman_id': _salesmanId,
        if (shopImageUrl != null) 'shop_image_url': shopImageUrl,
        if (nicFrontUrl != null) 'nic_image_url': nicFrontUrl,
        if (nicBackUrl != null) 'nic_back_image_url': nicBackUrl,
      });
      if (res.data['success'] == true) {
        final newCustomerId = res.data['data']?['id'] as String?;

        // Apply whatever custom prices were staged in step 2, now that
        // there's a real customer id to target — mirrors the admin
        // desktop wizard's handleSaveNewCustomerWithPricing.
        final pricesToApply = _customPrices.entries
            .where((e) => e.value.trim().isNotEmpty && double.tryParse(e.value.trim()) != null)
            .toList();
        if (newCustomerId != null && pricesToApply.isNotEmpty) {
          try {
            await Future.wait(pricesToApply.map((e) => DioClient.instance.put(
                '${ApiEndpoints.customers}/$newCustomerId/pricing/${e.key}',
                data: {'price': double.parse(e.value.trim())})));
          } catch (e) {
            debugPrint('Custom pricing save failed: $e');
          }
        }

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

  void _goBackAStep() {
    if (_step > 1) {
      setState(() => _step--);
    } else {
      goBack(context, _isDriver ? '/driver-dashboard' : '/salesman-dashboard');
    }
  }

  Widget _stepIndicator() {
    Widget circle(int n, String label) {
      final active = _step == n;
      final done = _step > n;
      return Expanded(
        child: Column(children: [
          CircleAvatar(
            radius: 14,
            backgroundColor: done ? AppColors.success : (active ? AppColors.orange : AppColors.white),
            child: done
                ? const Icon(Icons.check, size: 14, color: Colors.white)
                : Text('$n', style: TextStyle(color: active ? Colors.white : AppColors.steelBlue, fontWeight: FontWeight.bold, fontSize: 12)),
          ),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(
              fontSize: 11,
              color: active || done ? AppColors.navy : AppColors.steelBlue,
              fontWeight: active ? FontWeight.bold : FontWeight.normal)),
        ]),
      );
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(16)),
      child: Row(children: [
        circle(1, 'Details'),
        circle(2, 'Pricing'),
        circle(3, 'Review'),
      ]),
    );
  }

  Widget _buildStep1() {
    return Column(children: [
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
      _sectionCard(title: 'Account Setup', icon: Icons.account_balance_wallet_outlined, children: [
        _field('Credit Limit (PKR)', _creditLimitController, required: true,
            keyboardType: TextInputType.number, icon: Icons.speed_outlined, hint: '0 for no limit'),
        _field('Opening Balance — Amount Owed (PKR)', _openingBalanceController, required: true,
            keyboardType: TextInputType.number, icon: Icons.account_balance_outlined, hint: '0 for a fresh account'),
        const Text(
          'Both are visible to the customer and in the admin panel. Enter 0 for no limit / a fresh account.',
          style: TextStyle(color: AppColors.steelBlue, fontSize: 11),
        ),
      ]),
      if (_isDriver)
        _sectionCard(title: 'Salesman (optional)', icon: Icons.person_outline, children: [
          DropdownButtonFormField<String?>(
            initialValue: _salesmanId,
            isExpanded: true,
            decoration: InputDecoration(
              filled: true, fillColor: AppColors.warmGrey,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            ),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('No salesman — my own customer')),
              ..._salesmen.map((s) => DropdownMenuItem<String?>(
                  value: s['id'] as String, child: Text((s['full_name'] ?? '').toString(), overflow: TextOverflow.ellipsis))),
            ],
            onChanged: (v) => setState(() => _salesmanId = v),
          ),
          const Text(
            'This customer is added under you. You can also attach a salesman to look after them.',
            style: TextStyle(color: AppColors.steelBlue, fontSize: 11),
          ),
        ]),
    ]);
  }

  Widget _buildStep2() {
    if (_loadingProducts) {
      return const Padding(
        padding: EdgeInsets.only(top: 60),
        child: Center(child: CircularProgressIndicator(color: AppColors.orange)),
      );
    }
    return Column(children: [
      _sectionCard(title: 'Custom Pricing', icon: Icons.sell_outlined, children: [
        const Text(
          'Optional — leave blank to use the default catalog price for any product.',
          style: TextStyle(color: AppColors.steelBlue, fontSize: 12),
        ),
        const SizedBox(height: 12),
        TextField(
          onChanged: (v) => setState(() => _productSearch = v),
          decoration: InputDecoration(
            hintText: 'Search products or categories…',
            prefixIcon: const Icon(Icons.search, color: AppColors.orange, size: 20),
            filled: true,
            fillColor: AppColors.warmGrey,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          ),
        ),
      ]),
      if (_visibleProducts.isEmpty)
        const Padding(
          padding: EdgeInsets.only(top: 30),
          child: Center(child: Text('No products found.', style: TextStyle(color: AppColors.steelBlue))),
        )
      else
        ..._visibleProducts.map((p) {
          final id = p['id'] as String;
          final name = p['name'] as String? ?? '';
          final price = p['price'];
          final category = _categoryName(p['category_id'] as String?);
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(14),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(name, style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.navy, fontSize: 14), overflow: TextOverflow.ellipsis),
                  if (category.isNotEmpty)
                    Text(category, style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
                  Text('Default: PKR ${_formatPrice(price)}',
                      style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
                ]),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 110,
                child: TextField(
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  textAlign: TextAlign.right,
                  decoration: InputDecoration(
                    hintText: _formatPrice(price),
                    isDense: true,
                    filled: true,
                    fillColor: AppColors.warmGrey,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  ),
                  controller: TextEditingController(text: _customPrices[id] ?? '')
                    ..selection = TextSelection.collapsed(offset: (_customPrices[id] ?? '').length),
                  onChanged: (v) => _customPrices[id] = v,
                ),
              ),
            ]),
          );
        }),
    ]);
  }

  String _formatPrice(dynamic price) {
    final n = price is num ? price : double.tryParse('$price') ?? 0;
    return n.toStringAsFixed(n.truncateToDouble() == n ? 0 : 2);
  }

  Widget _reviewRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 120, child: Text(label, style: const TextStyle(color: AppColors.steelBlue, fontSize: 12))),
        Expanded(child: Text(value.isEmpty ? '—' : value, style: const TextStyle(color: AppColors.navy, fontSize: 13, fontWeight: FontWeight.w600))),
      ]),
    );
  }

  Widget _buildStep3() {
    final pricedEntries = _customPrices.entries
        .where((e) => e.value.trim().isNotEmpty && double.tryParse(e.value.trim()) != null)
        .toList();
    return Column(children: [
      _sectionCard(title: 'Customer Details', icon: Icons.badge_outlined, children: [
        _reviewRow('Full Name', _nameController.text.trim()),
        _reviewRow('Phone', _phoneController.text.trim()),
        if (_isDriver)
          _reviewRow('Salesman', _salesmen.where((s) => s['id'] == _salesmanId).map((s) => (s['full_name'] ?? '').toString()).firstOrNull ?? 'None — my own customer'),
      ]),
      _sectionCard(title: 'Shop Details', icon: Icons.storefront_outlined, children: [
        _reviewRow('Shop Name', _shopNameController.text.trim()),
        _reviewRow('Address', _addressController.text.trim()),
        _reviewRow('City', _cityController.text.trim()),
        _reviewRow('Area', _areaController.text.trim()),
        _reviewRow('Location', _shopLatitude != null ? '${_shopLatitude!.toStringAsFixed(5)}, ${_shopLongitude!.toStringAsFixed(5)}' : ''),
      ]),
      _sectionCard(title: 'Identification', icon: Icons.badge_outlined, children: [
        _reviewRow('NIC Number', _nicNumberController.text.trim()),
      ]),
      _sectionCard(title: 'Account Setup', icon: Icons.account_balance_wallet_outlined, children: [
        _reviewRow('Credit Limit', 'PKR ${_creditLimitController.text.trim()}'),
        _reviewRow('Opening Balance', 'PKR ${_openingBalanceController.text.trim()}'),
      ]),
      _sectionCard(title: 'Custom Pricing', icon: Icons.sell_outlined, children: [
        if (pricedEntries.isEmpty)
          const Text('No custom prices set — default catalog prices will apply.',
              style: TextStyle(color: AppColors.steelBlue, fontSize: 12))
        else
          ...pricedEntries.map((e) {
            final product = _products.firstWhere((p) => p['id'] == e.key, orElse: () => {});
            return _reviewRow(product['name'] as String? ?? 'Product', 'PKR ${e.value.trim()}');
          }),
      ]),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.orange.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
        child: const Row(children: [
          Icon(Icons.info_outline, color: AppColors.orange, size: 18),
          SizedBox(width: 10),
          Expanded(child: Text('Review everything above — tap Add Customer to create the account.',
              style: TextStyle(color: AppColors.navy, fontSize: 12))),
        ]),
      ),
    ]);
  }

  @override
  void initState() {
    super.initState();
    _loadDriverExtras();
  }

  Future<void> _loadDriverExtras() async {
    if (await SecureStorage.getRole() != 'driver') return;
    try {
      final res = await DioClient.instance.get(ApiEndpoints.salesmenDirectory);
      if (!mounted) return;
      setState(() {
        _isDriver = true;
        if (res.data['success'] == true) {
          _salesmen = List<Map<String, dynamic>>.from(res.data['data'] ?? []);
        }
      });
    } catch (e) {
      if (mounted) setState(() => _isDriver = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _step == 1,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _goBackAStep();
      },
      child: Scaffold(
        backgroundColor: AppColors.warmGrey,
        appBar: AppBar(
          backgroundColor: AppColors.navy,
          leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: _goBackAStep),
          title: const Text('Add Customer', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        ),
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: _stepIndicator(),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              children: [
                if (_step == 1) _buildStep1()
                else if (_step == 2) _buildStep2()
                else _buildStep3(),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Row(children: [
              if (_step > 1)
                Expanded(
                  child: OutlinedButton(
                    onPressed: _goBackAStep,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.navy,
                      side: const BorderSide(color: AppColors.navy),
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: const Text('Back'),
                  ),
                ),
              if (_step > 1) const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: _step == 1
                    ? RHRButton(text: 'Next', onPressed: _goToPricingStep, isLoading: false)
                    : (_step == 2
                        ? RHRButton(text: 'Next: Review', onPressed: () => setState(() => _step = 3), isLoading: false)
                        : RHRButton(text: 'Add Customer', onPressed: _save, isLoading: _saving)),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
