import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/rhr_input_field.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/widgets/tap_scale.dart';
import '../../../shared/router/app_transitions.dart';

/// Customer self-service payment submission — mirrors the salesman app's
/// Record Payment (Cash / Bank Transfer, photo proof required), but
/// always for the customer's own account and always goes through the
/// admin-reviewed /payments queue (there's no instant-credit path for a
/// customer-submitted claim the way there is for a salesman's own
/// field collection).
class AddPaymentScreen extends StatefulWidget {
  const AddPaymentScreen({super.key});

  @override
  State<AddPaymentScreen> createState() => _AddPaymentScreenState();
}

class _AddPaymentScreenState extends State<AddPaymentScreen> {
  final _amountController = TextEditingController();
  final _notesController  = TextEditingController();
  String  _selectedMethod = 'Cash';
  bool    _photoUploaded  = false;
  bool    _isLoading      = false;
  bool    _isSubmitting   = false;
  String? _uploadedPhotoUrl;

  final List<String> _methods = ['Cash', 'Bank Transfer'];

  List<Map<String, dynamic>> _bankAccounts = [];
  bool _loadingBankAccounts = false;
  String? _selectedBankAccountId;

  @override
  void dispose() {
    _amountController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _loadBankAccounts() async {
    if (_bankAccounts.isNotEmpty || _loadingBankAccounts) return;
    setState(() => _loadingBankAccounts = true);
    try {
      final res = await DioClient.instance.get(ApiEndpoints.bankAccountsList);
      if (res.data['success'] == true) {
        final banks = List<Map<String, dynamic>>.from(res.data['data'] ?? [])
            .where((a) => (a['bank_name']?.toString().trim().toLowerCase() ?? '') != 'cash')
            .toList();
        setState(() => _bankAccounts = banks);
      }
    } catch (e) {
      debugPrint('Bank accounts load error: $e');
    } finally {
      if (mounted) setState(() => _loadingBankAccounts = false);
    }
  }

  Future<void> _pickAndUploadPhoto() async {
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

    setState(() => _isLoading = true);
    try {
      final bytes = await File(image.path).readAsBytes();
      final b64   = base64Encode(bytes);
      final response = await DioClient.instance.post(
        ApiEndpoints.storageUpload,
        data: {
          'bucket':     'payment-proofs',
          'fileName':   'payment_${DateTime.now().millisecondsSinceEpoch}.jpg',
          'fileBase64': b64,
          'mimeType':   'image/jpeg',
        },
      );
      if (response.data['success'] == true) {
        setState(() {
          _uploadedPhotoUrl = response.data['data']['url'] as String?;
          _photoUploaded    = _uploadedPhotoUrl != null;
        });
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Photo upload failed. Try again.')));
      }
    } catch (e) {
      if (mounted) {
        final msg = e is DioException ? (e.response?.data?['message'] ?? e.message) : e.toString();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Upload error: $msg')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _submitPayment() async {
    if (_amountController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please enter an amount.')));
      return;
    }
    if (_uploadedPhotoUrl == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please upload a payment photo.')));
      return;
    }
    if (_selectedMethod == 'Bank Transfer' && _selectedBankAccountId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please select which bank account you sent it to.')));
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      final amount = double.parse(_amountController.text.trim());
      final notes = _notesController.text.trim().isNotEmpty ? _notesController.text.trim() : null;

      final response = await DioClient.instance.post(ApiEndpoints.payments, data: {
        'amount': amount,
        // payments.method is a Postgres enum on the backend — only
        // 'cash'/'bank_transfer'/'credit_account' are valid values.
        'method': _selectedMethod == 'Bank Transfer' ? 'bank_transfer' : 'cash',
        'photo_url': _uploadedPhotoUrl,
        if (_selectedMethod == 'Bank Transfer') 'bank_account_id': _selectedBankAccountId,
        if (notes != null) 'notes': notes,
      });

      if (response.data['success'] == true) {
        if (mounted) {
          await showSuccessCheck(context, message: 'Payment Submitted!');
          if (mounted) context.go('/home');
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(response.data['message'] ?? 'Submission failed')));
      }
    } catch (e) {
      if (mounted) {
        final msg = e is DioException ? (e.response?.data?['message'] ?? e.message) : e.toString();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Submission failed: $msg')));
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => goBack(context, '/home'),
        ),
        title: const Text('Add Payment', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.surfaceContainerLowest,
                borderRadius: BorderRadius.circular(14),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  RHRInputField(
                    label: 'Amount Paid',
                    hint: '0',
                    controller: _amountController,
                    keyboardType: TextInputType.number,
                    prefixText: 'PKR ',
                  ),
                  const SizedBox(height: 24),

                  const Text('Payment Method', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.onBackground)),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    children: _methods.map((method) {
                      final selected = _selectedMethod == method;
                      return TapScale(
                        onTap: () {
                          setState(() => _selectedMethod = method);
                          if (method == 'Bank Transfer') _loadBankAccounts();
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: selected ? AppColors.primary : AppColors.surfaceContainerLow,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: selected ? AppColors.primary : AppColors.outlineVariant),
                          ),
                          child: Text(method,
                              style: TextStyle(color: selected ? Colors.white : AppColors.onBackground, fontWeight: FontWeight.w600, fontSize: 13)),
                        ),
                      );
                    }).toList(),
                  ),

                  if (_selectedMethod == 'Bank Transfer') ...[
                    const SizedBox(height: 20),
                    const Text('Bank Account', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.onBackground)),
                    const SizedBox(height: 10),
                    _loadingBankAccounts
                        ? const Center(child: Padding(
                            padding: EdgeInsets.all(8),
                            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary)))
                        : DropdownButtonFormField<String>(
                            initialValue: _selectedBankAccountId,
                            isExpanded: true,
                            decoration: InputDecoration(
                              filled: true,
                              fillColor: AppColors.surfaceContainerLow,
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                              hintText: _bankAccounts.isEmpty ? 'No bank accounts set up' : 'Select account you sent to',
                            ),
                            items: _bankAccounts.map((a) => DropdownMenuItem(
                              value: a['id'] as String,
                              child: Text('${a['bank_name']} — ${a['account_name']}', overflow: TextOverflow.ellipsis),
                            )).toList(),
                            onChanged: (v) => setState(() => _selectedBankAccountId = v),
                          ),
                  ],

                  const SizedBox(height: 24),
                  RHRInputField(label: 'Notes (optional)', controller: _notesController),
                  const SizedBox(height: 24),

                  const Text('Payment Photo Proof', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.onBackground)),
                  const Text('Required — take a photo of the cash/receipt', style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12)),
                  const SizedBox(height: 12),

                  TapScale(
                    onTap: _isLoading ? null : _pickAndUploadPhoto,
                    child: Container(
                      width: double.infinity,
                      height: 120,
                      decoration: BoxDecoration(
                        color: _photoUploaded ? AppColors.success.withValues(alpha: 0.1) : AppColors.surfaceContainerLow,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: _photoUploaded ? AppColors.success : AppColors.outlineVariant, width: 2),
                      ),
                      child: _isLoading
                          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                          : Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(_photoUploaded ? Icons.check_circle : Icons.camera_alt_outlined,
                                    color: _photoUploaded ? AppColors.success : AppColors.onSurfaceVariant, size: 36),
                                const SizedBox(height: 8),
                                Text(_photoUploaded ? 'Photo uploaded!' : 'Tap to take photo',
                                    style: TextStyle(color: _photoUploaded ? AppColors.success : AppColors.onSurfaceVariant, fontWeight: FontWeight.w600)),
                              ],
                            ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            RHRButton(text: 'Submit Payment', onPressed: _submitPayment, isLoading: _isSubmitting),
          ],
        ),
      ),
    );
  }
}
