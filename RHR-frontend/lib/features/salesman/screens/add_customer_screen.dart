import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/widgets/shop_location_picker_screen.dart';
import '../../../shared/router/app_transitions.dart';

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
  bool _saving = false;
  double? _shopLatitude;
  double? _shopLongitude;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _shopNameController.dispose();
    _addressController.dispose();
    _cityController.dispose();
    _areaController.dispose();
    super.dispose();
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

  Future<void> _save() async {
    if (_nameController.text.trim().isEmpty || _phoneController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Name and phone are required.')));
      return;
    }
    setState(() => _saving = true);
    try {
      final res = await DioClient.instance.post(ApiEndpoints.customers, data: {
        'full_name': _nameController.text.trim(),
        'phone': _phoneController.text.trim(),
        if (_shopNameController.text.trim().isNotEmpty) 'shop_name': _shopNameController.text.trim(),
        if (_addressController.text.trim().isNotEmpty) 'shop_address': _addressController.text.trim(),
        if (_cityController.text.trim().isNotEmpty) 'city': _cityController.text.trim(),
        if (_areaController.text.trim().isNotEmpty) 'area': _areaController.text.trim(),
        if (_shopLatitude != null) 'shop_latitude': _shopLatitude,
        if (_shopLongitude != null) 'shop_longitude': _shopLongitude,
      });
      if (res.data['success'] == true) {
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

  Widget _field(String label, TextEditingController controller, {bool required = false, TextInputType? keyboardType, IconData? icon}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(required ? '$label *' : label,
            style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.navy, fontSize: 13)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          decoration: InputDecoration(
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
            _field('Shop Name', _shopNameController, icon: Icons.store_outlined),
            _field('Shop Address', _addressController, icon: Icons.home_outlined),
            _field('City', _cityController, icon: Icons.location_city_outlined),
            _field('Area', _areaController, icon: Icons.map_outlined),
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
          ]),
          const SizedBox(height: 4),
          RHRButton(text: 'Save Customer', onPressed: _save, isLoading: _saving),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}
