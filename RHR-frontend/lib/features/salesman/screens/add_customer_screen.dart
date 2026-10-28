import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import '../../../core/storage/secure_storage.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/widgets/shop_location_picker_screen.dart';
import '../../../shared/router/app_transitions.dart';
import '../../../shared/utils/input_formatters.dart';
import '../../../shared/widgets/premium_ui.dart';

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
  bool _isDriver = false;
  List<Map<String, dynamic>> _salesmen = [];
  String? _salesmanId;
  double? _shopLatitude;
  double? _shopLongitude;
  File? _shopImageFile;
  File? _nicFrontImageFile;
  File? _nicBackImageFile;

  int _step = 1;
  List<Map<String, dynamic>> _categories = [];
  List<Map<String, dynamic>> _products = [];
  bool _loadingProducts = false;
  String _productSearch = '';
  final Map<String, String> _customPrices = {};

  @override
  void initState() {
    super.initState();
    _loadDriverExtras();
  }

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

  bool _validateStep1() {
    final checks = <String, bool>{
      'Full Name': _nameController.text.trim().isNotEmpty,
      'Phone Number': _phoneController.text.trim().isNotEmpty,
      'Shop Name': _shopNameController.text.trim().isNotEmpty,
      'Shop Address': _addressController.text.trim().isNotEmpty,
      'City': _cityController.text.trim().isNotEmpty,
      'Area': _areaController.text.trim().isNotEmpty,
      'Shop Photo': _shopImageFile != null,
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

  void _goBackAStep() {
    if (_step > 1) {
      setState(() => _step--);
    } else {
      goBack(context, _isDriver ? '/driver-dashboard' : '/salesman-dashboard');
    }
  }

  Widget _stepIndicator() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8)],
      ),
      child: Row(children: [
        _stepCircle(1, 'Details'),
        Expanded(child: Container(height: 2, color: _step > 1 ? kNavy : const Color(0xFFE0E5EF))),
        _stepCircle(2, 'Pricing'),
        Expanded(child: Container(height: 2, color: _step > 2 ? kNavy : const Color(0xFFE0E5EF))),
        _stepCircle(3, 'Review'),
      ]),
    );
  }

  Widget _stepCircle(int n, String label) {
    final active = _step == n;
    final done = _step > n;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      CircleAvatar(
        radius: 14,
        backgroundColor: done ? kGreen : (active ? kNavy : const Color(0xFFE0E5EF)),
        child: done
            ? const Icon(Icons.check_rounded, size: 14, color: Colors.white)
            : Text('$n', style: TextStyle(
                color: active ? Colors.white : kTextMuted,
                fontWeight: FontWeight.w700, fontSize: 12)),
      ),
      const SizedBox(height: 4),
      Text(label, style: TextStyle(
          fontSize: 11,
          color: active || done ? kNavy : kTextMuted,
          fontWeight: active ? FontWeight.w700 : FontWeight.normal)),
    ]);
  }

  Widget _sectionCard({required String title, required IconData icon, required List<Widget> children}) {
    return PremiumCard(
      margin: const EdgeInsets.only(bottom: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 34, height: 34,
            decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(9)),
            child: Icon(icon, color: kNavy, size: 18),
          ),
          const SizedBox(width: 10),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 15)),
        ]),
        const SizedBox(height: 16),
        ...children,
      ]),
    );
  }

  Widget _field(String label, TextEditingController controller,
      {bool required = false, TextInputType? keyboardType, IconData? icon,
       List<TextInputFormatter>? inputFormatters, String? hint}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: PremiumInput(
        label: required ? '$label *' : label,
        hint: hint,
        controller: controller,
        keyboardType: keyboardType,
        prefixIcon: icon,
        inputFormatters: inputFormatters,
      ),
    );
  }

  Widget _imagePicker({required String label, required File? file, required VoidCallback onTap}) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: kNavy)),
      const SizedBox(height: 6),
      GestureDetector(
        onTap: onTap,
        child: Container(
          width: double.infinity,
          height: 110,
          decoration: BoxDecoration(
            color: kCardBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE0E5EF)),
          ),
          clipBehavior: Clip.antiAlias,
          child: file != null
              ? Image.file(file, fit: BoxFit.cover, width: double.infinity)
              : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.add_photo_alternate_rounded, color: kNavy.withValues(alpha: 0.3), size: 28),
                  const SizedBox(height: 6),
                  const Text('Tap to upload', style: TextStyle(color: kTextMuted, fontSize: 12)),
                ]),
        ),
      ),
    ]);
  }

  Widget _buildStep1() {
    return Column(children: [
      _sectionCard(title: 'Customer Details', icon: Icons.badge_outlined, children: [
        _field('Full Name', _nameController, required: true, icon: Icons.person_outline_rounded),
        _field('Phone Number', _phoneController, required: true,
            keyboardType: TextInputType.phone, icon: Icons.phone_outlined),
      ]),
      _sectionCard(title: 'Shop Details', icon: Icons.storefront_outlined, children: [
        _field('Shop Name', _shopNameController, required: true, icon: Icons.store_outlined),
        _field('Shop Address', _addressController, required: true, icon: Icons.home_outlined),
        _field('City', _cityController, required: true, icon: Icons.location_city_outlined),
        _field('Area', _areaController, required: true, icon: Icons.map_outlined),
        GestureDetector(
          onTap: _pickLocation,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: kNavy.withValues(alpha: 0.4)),
            ),
            child: Row(children: [
              const Icon(Icons.my_location_rounded, size: 18, color: kNavy),
              const SizedBox(width: 8),
              Text(_shopLatitude != null ? 'Update Shop Location' : 'Set Shop Location *',
                  style: const TextStyle(color: kNavy, fontWeight: FontWeight.w700, fontSize: 13)),
            ]),
          ),
        ),
        if (_shopLatitude != null && _shopLongitude != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(children: [
              const Icon(Icons.check_circle_rounded, size: 14, color: kGreen),
              const SizedBox(width: 6),
              Text(
                'Location captured (${_shopLatitude!.toStringAsFixed(5)}, ${_shopLongitude!.toStringAsFixed(5)})',
                style: const TextStyle(color: kGreen, fontSize: 11),
              ),
            ]),
          ),
        const SizedBox(height: 14),
        _imagePicker(label: 'Shop Photo *', file: _shopImageFile, onTap: () => _pickImage('shop')),
      ]),
      _sectionCard(title: 'Identification', icon: Icons.badge_outlined, children: [
        _field('NIC Number (optional)', _nicNumberController, required: false,
            icon: Icons.badge_outlined, hint: '42101-1234567-1',
            keyboardType: TextInputType.number,
            inputFormatters: [CnicInputFormatter()]),
        Row(children: [
          Expanded(child: _imagePicker(label: 'NIC Front (optional)', file: _nicFrontImageFile, onTap: () => _pickImage('nicFront'))),
          const SizedBox(width: 12),
          Expanded(child: _imagePicker(label: 'NIC Back (optional)', file: _nicBackImageFile, onTap: () => _pickImage('nicBack'))),
        ]),
      ]),
      _sectionCard(title: 'Account Setup', icon: Icons.account_balance_wallet_outlined, children: [
        _field('Credit Limit (PKR)', _creditLimitController, required: true,
            keyboardType: TextInputType.number, icon: Icons.speed_outlined, hint: '0 for no limit'),
        _field('Opening Balance — Amount Owed (PKR)', _openingBalanceController, required: true,
            keyboardType: TextInputType.number, icon: Icons.account_balance_outlined, hint: '0 for a fresh account'),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(8)),
          child: const Row(children: [
            Icon(Icons.info_outline_rounded, size: 13, color: kTextMuted),
            SizedBox(width: 6),
            Expanded(child: Text(
              'Both are visible to the customer and in admin. Enter 0 for no limit / fresh account.',
              style: TextStyle(color: kTextMuted, fontSize: 11),
            )),
          ]),
        ),
      ]),
      if (_isDriver)
        _sectionCard(title: 'Salesman (optional)', icon: Icons.person_outline_rounded, children: [
          DropdownButtonFormField<String?>(
            value: _salesmanId,
            isExpanded: true,
            decoration: InputDecoration(
              filled: true, fillColor: kCardBg,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE0E5EF))),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE0E5EF))),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            ),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('No salesman — my own customer')),
              ..._salesmen.map((s) => DropdownMenuItem<String?>(
                  value: s['id'] as String, child: Text((s['full_name'] ?? '').toString(), overflow: TextOverflow.ellipsis))),
            ],
            onChanged: (v) => setState(() => _salesmanId = v),
          ),
        ]),
    ]);
  }

  Widget _buildStep2() {
    if (_loadingProducts) {
      return const Padding(
        padding: EdgeInsets.only(top: 60),
        child: Center(child: CircularProgressIndicator(color: kNavy)),
      );
    }
    return Column(children: [
      _sectionCard(title: 'Custom Pricing', icon: Icons.sell_outlined, children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(8)),
          child: const Row(children: [
            Icon(Icons.info_outline_rounded, size: 13, color: kTextMuted),
            SizedBox(width: 6),
            Expanded(child: Text(
              'Optional — leave blank to use default catalog price.',
              style: TextStyle(color: kTextMuted, fontSize: 12),
            )),
          ]),
        ),
        const SizedBox(height: 12),
        PremiumSearchBar(
          hint: 'Search products or categories…',
          onChanged: (v) => setState(() => _productSearch = v),
          margin: EdgeInsets.zero,
        ),
      ]),
      if (_visibleProducts.isEmpty)
        const Padding(
          padding: EdgeInsets.only(top: 30),
          child: PremiumEmpty(icon: Icons.inventory_2_outlined, title: 'No products found'),
        )
      else
        ..._visibleProducts.map((p) {
          final id = p['id'] as String;
          final name = p['name'] as String? ?? '';
          final price = p['price'];
          final category = _categoryName(p['category_id'] as String?);
          return PremiumCard(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(name, style: const TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 13), overflow: TextOverflow.ellipsis),
                if (category.isNotEmpty) Text(category, style: const TextStyle(color: kTextMuted, fontSize: 11)),
                Text('Default: PKR ${_formatPrice(price)}', style: const TextStyle(color: kTextMuted, fontSize: 11)),
              ])),
              const SizedBox(width: 10),
              SizedBox(
                width: 110,
                child: TextField(
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  textAlign: TextAlign.right,
                  style: const TextStyle(color: kNavy, fontWeight: FontWeight.w700, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: _formatPrice(price),
                    hintStyle: const TextStyle(color: kTextMuted),
                    isDense: true,
                    filled: true,
                    fillColor: kCardBg,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFE0E5EF))),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFE0E5EF))),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: kNavy, width: 1.5)),
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
        SizedBox(width: 120, child: Text(label, style: const TextStyle(color: kTextMuted, fontSize: 12))),
        Expanded(child: Text(value.isEmpty ? '—' : value,
            style: const TextStyle(color: kNavy, fontSize: 13, fontWeight: FontWeight.w600))),
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
          _reviewRow('Salesman', _salesmen.where((s) => s['id'] == _salesmanId)
              .map((s) => (s['full_name'] ?? '').toString()).firstOrNull ?? 'None — my own'),
      ]),
      _sectionCard(title: 'Shop Details', icon: Icons.storefront_outlined, children: [
        _reviewRow('Shop Name', _shopNameController.text.trim()),
        _reviewRow('Address', _addressController.text.trim()),
        _reviewRow('City', _cityController.text.trim()),
        _reviewRow('Area', _areaController.text.trim()),
        _reviewRow('Location', _shopLatitude != null
            ? '${_shopLatitude!.toStringAsFixed(5)}, ${_shopLongitude!.toStringAsFixed(5)}'
            : ''),
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
              style: TextStyle(color: kTextMuted, fontSize: 12))
        else
          ...pricedEntries.map((e) {
            final product = _products.firstWhere((p) => p['id'] == e.key, orElse: () => {});
            return _reviewRow(product['name'] as String? ?? 'Product', 'PKR ${e.value.trim()}');
          }),
      ]),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(12)),
        child: const Row(children: [
          Icon(Icons.check_circle_outlined, color: kNavy, size: 18),
          SizedBox(width: 10),
          Expanded(child: Text('Review everything above — tap Add Customer to create the account.',
              style: TextStyle(color: kNavy, fontSize: 12))),
        ]),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _step == 1,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _goBackAStep();
      },
      child: Scaffold(
        backgroundColor: kCardBg,
        appBar: premiumAppBar(
          'Add Customer',
          subtitle: 'Step $_step of 3',
          onBack: _goBackAStep,
        ),
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: _stepIndicator(),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 16),
              children: [
                if (_step == 1) _buildStep1()
                else if (_step == 2) _buildStep2()
                else _buildStep3(),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: Color(0xFFE0E5EF))),
            ),
            child: SafeArea(
              top: false,
              child: Row(children: [
                if (_step > 1)
                  Expanded(child: GestureDetector(
                    onTap: _goBackAStep,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFE0E5EF)),
                      ),
                      child: const Text('Back', textAlign: TextAlign.center,
                          style: TextStyle(color: kNavy, fontWeight: FontWeight.w700)),
                    ),
                  )),
                if (_step > 1) const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: PremiumButton(
                    text: _step == 1 ? 'Next' : (_step == 2 ? 'Next: Review' : 'Add Customer'),
                    onPressed: _step == 1
                        ? _goToPricingStep
                        : (_step == 2 ? () => setState(() => _step = 3) : _save),
                    isLoading: _saving,
                    icon: _step == 3 ? Icons.person_add_rounded : Icons.arrow_forward_rounded,
                  ),
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}
