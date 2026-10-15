import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/success_check.dart';
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
      });
      if (res.data['success'] == true) {
        if (mounted) await showSuccessCheck(context, message: 'Customer Added!');
        if (mounted) context.pop(true);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res.data['message'] ?? 'Failed')));
      }
    } catch (e) {
      if (mounted) {
        final msg = e.toString().contains('already exists') ? 'A customer with this phone number already exists.' : 'Error: $e';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _field(String label, TextEditingController controller, {bool required = false, TextInputType? keyboardType}) {
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
            filled: true,
            fillColor: AppColors.warmGrey,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          ),
        ),
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
        padding: const EdgeInsets.all(20),
        children: [
          _field('Full Name', _nameController, required: true),
          _field('Phone Number', _phoneController, required: true, keyboardType: TextInputType.phone),
          _field('Shop Name', _shopNameController),
          _field('Shop Address', _addressController),
          _field('City', _cityController),
          _field('Area', _areaController),
          const SizedBox(height: 10),
          RHRButton(text: 'Save Customer', onPressed: _save, isLoading: _saving),
        ],
      ),
    );
  }
}
