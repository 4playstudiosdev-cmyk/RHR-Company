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

class RecordPaymentScreen extends StatefulWidget {
  final String? customerId;
  const RecordPaymentScreen({super.key, this.customerId});

  @override
  State<RecordPaymentScreen> createState() => _RecordPaymentScreenState();
}

class _RecordPaymentScreenState extends State<RecordPaymentScreen> {
  final _amountController = TextEditingController();
  final _notesController  = TextEditingController();
  String  _selectedMethod   = 'Cash';
  bool    _photoUploaded    = false;
  bool    _isLoading        = false;
  String? _uploadedPhotoUrl;

  final List<String> _methods = ['Cash', 'Bank Transfer', 'Credit Account'];

  // Bank Transfer specifics — backend only special-cases method=='bank'
  // (bank_account_id required), so the label above is display-only.
  List<Map<String, dynamic>> _bankAccounts = [];
  bool _loadingBankAccounts = false;
  String? _selectedBankAccountId;
  DateTime _transferDate = DateTime.now();

  Future<void> _loadBankAccounts() async {
    if (_bankAccounts.isNotEmpty || _loadingBankAccounts) return;
    setState(() => _loadingBankAccounts = true);
    try {
      final res = await DioClient.instance.get(ApiEndpoints.bankAccountsList);
      if (res.data['success'] == true) {
        // Admin's bank_accounts list includes a "Cash" petty-cash entry
        // used elsewhere (e.g. expenses) — not a real bank, so it has no
        // place here (Bank Transfer is a separate method from Cash above).
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

  Future<void> _pickTransferDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _transferDate,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _transferDate = picked);
  }

  @override
  void dispose() {
    _amountController.dispose();
    _notesController.dispose();
    super.dispose();
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
    // imageQuality compresses at pick time — a raw camera photo can run
    // 8-15MB, well past what's worth sending over a salesman's mobile
    // data; 70% keeps the receipt legible at a fraction of the size.
    final image = await picker.pickImage(source: source, imageQuality: 70);
    if (image == null) return;

    setState(() => _isLoading = true);
    try {
      final bytes  = await File(image.path).readAsBytes();
      final b64    = base64Encode(bytes);
      // Backend (storage.controller.js) expects fileBase64/fileName/mimeType
      // and only recognizes buckets: product-images, payment-proofs, invoices
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
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Photo upload failed. Try again.')));
        }
      }
    } catch (e) {
      if (mounted) {
        final msg = e is DioException ? (e.response?.data?['message'] ?? e.message) : e.toString();
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Upload error: $msg')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _submitPayment() async {
    if (widget.customerId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No customer selected — open this from a customer\'s page first.')));
      return;
    }
    if (_amountController.text.isEmpty) {
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
          const SnackBar(content: Text('Please select which bank account it went to.')));
      return;
    }
    setState(() => _isLoading = true);
    try {
      // method must be exactly 'bank' for Bank Transfer — that's the one
      // value payments.controller.js special-cases (requires
      // bank_account_id). Everything else is free text for display.
      final method = _selectedMethod == 'Bank Transfer'
          ? 'bank'
          : _selectedMethod.toLowerCase().replaceAll(' ', '_');
      final response = await DioClient.instance.post(
        ApiEndpoints.payments,
        data: {
          'customer_id': widget.customerId,
          'amount':      double.parse(_amountController.text),
          'method':      method,
          'photo_url':   _uploadedPhotoUrl,
          if (_selectedMethod == 'Bank Transfer') ...{
            'bank_account_id': _selectedBankAccountId,
            'date': _transferDate.toIso8601String(),
          },
          if (_notesController.text.trim().isNotEmpty) 'notes': _notesController.text.trim(),
        },
      );
      if (response.data['success'] == true) {
        if (mounted) {
          await showSuccessCheck(context, message: 'Payment Recorded!');
          if (mounted) context.go('/salesman-dashboard');
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
                content: Text(
                    response.data['message'] ?? 'Payment failed')));
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Payment failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => goBack(context, '/salesman-dashboard'),
        ),
        title: const Text('Record Payment',
            style:
                TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Payment Form
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.white,
                borderRadius: BorderRadius.circular(14),
                boxShadow: [
                  BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 8,
                      offset: const Offset(0, 2)),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 20),
                    decoration: BoxDecoration(
                      color: AppColors.orange,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),

                  RHRInputField(
                    label: 'Amount Collected',
                    hint: '0',
                    controller: _amountController,
                    keyboardType: TextInputType.number,
                    prefixText: 'PKR ',
                  ),

                  const SizedBox(height: 24),

                  const Text('Payment Method',
                      style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: AppColors.navy)),
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
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: selected
                                ? AppColors.orange
                                : AppColors.warmGrey,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: selected
                                  ? AppColors.orange
                                  : AppColors.disabled,
                            ),
                          ),
                          child: Text(
                            method,
                            style: TextStyle(
                              color: selected
                                  ? Colors.white
                                  : AppColors.navy,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),

                  if (_selectedMethod == 'Bank Transfer') ...[
                    const SizedBox(height: 20),
                    const Text('Bank Account',
                        style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy)),
                    const SizedBox(height: 10),
                    _loadingBankAccounts
                        ? const Center(child: Padding(
                            padding: EdgeInsets.all(8),
                            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.orange)))
                        : DropdownButtonFormField<String>(
                            initialValue: _selectedBankAccountId,
                            isExpanded: true,
                            decoration: InputDecoration(
                              filled: true,
                              fillColor: AppColors.warmGrey,
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                              hintText: _bankAccounts.isEmpty ? 'No bank accounts set up' : 'Select account',
                            ),
                            items: _bankAccounts.map((a) => DropdownMenuItem(
                              value: a['id'] as String,
                              child: Text('${a['bank_name']} — ${a['account_name']}', overflow: TextOverflow.ellipsis),
                            )).toList(),
                            onChanged: (v) => setState(() => _selectedBankAccountId = v),
                          ),
                    const SizedBox(height: 20),
                    const Text('Transfer Date',
                        style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy)),
                    const SizedBox(height: 10),
                    TapScale(
                      onTap: _pickTransferDate,
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                        decoration: BoxDecoration(color: AppColors.warmGrey, borderRadius: BorderRadius.circular(10)),
                        child: Row(children: [
                          const Icon(Icons.calendar_today_outlined, size: 18, color: AppColors.steelBlue),
                          const SizedBox(width: 10),
                          Text('${_transferDate.year}-${_transferDate.month.toString().padLeft(2, '0')}-${_transferDate.day.toString().padLeft(2, '0')}',
                              style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w600)),
                        ]),
                      ),
                    ),
                  ],

                  const SizedBox(height: 24),

                  RHRInputField(
                    label: 'Notes (optional)',
                    controller: _notesController,
                  ),

                  const SizedBox(height: 24),

                  // Photo Upload
                  const Text('Payment Photo Proof',
                      style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: AppColors.navy)),
                  const Text(
                      'Required — take a photo of the cash/receipt',
                      style: TextStyle(
                          color: AppColors.steelBlue, fontSize: 12)),
                  const SizedBox(height: 12),

                  TapScale(
                    onTap: _isLoading ? null : _pickAndUploadPhoto,
                    child: Container(
                      width: double.infinity,
                      height: 120,
                      decoration: BoxDecoration(
                        color: _photoUploaded
                            ? AppColors.success.withValues(alpha: 0.1)
                            : AppColors.warmGrey,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: _photoUploaded
                              ? AppColors.success
                              : AppColors.disabled,
                          width: 2,
                        ),
                      ),
                      child: _isLoading
                          ? const Center(
                              child: CircularProgressIndicator(
                                  color: AppColors.orange))
                          : Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  _photoUploaded
                                      ? Icons.check_circle
                                      : Icons.camera_alt_outlined,
                                  color: _photoUploaded
                                      ? AppColors.success
                                      : AppColors.steelBlue,
                                  size: 36,
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  _photoUploaded
                                      ? 'Photo uploaded!'
                                      : 'Tap to take photo',
                                  style: TextStyle(
                                    color: _photoUploaded
                                        ? AppColors.success
                                        : AppColors.steelBlue,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            RHRButton(
              text: 'Submit Payment',
              onPressed: _submitPayment,
              isLoading: _isLoading,
            ),
          ],
        ),
      ),
    );
  }
}
