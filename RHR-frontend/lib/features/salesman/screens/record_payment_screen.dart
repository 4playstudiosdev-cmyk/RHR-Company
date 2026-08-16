import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/rhr_input_field.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/widgets/tap_scale.dart';

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

  @override
  void dispose() {
    _amountController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _pickAndUploadPhoto() async {
    final picker = ImagePicker();
    final image  = await picker.pickImage(source: ImageSource.camera);
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
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Upload error: $e')));
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
    setState(() => _isLoading = true);
    try {
      // Backend (payments.controller.js) expects customer_id + method
      // (not payment_method) and requires customer_id, amount, photo_url
      final response = await DioClient.instance.post(
        ApiEndpoints.payments,
        data: {
          'customer_id': widget.customerId,
          'amount':      double.parse(_amountController.text),
          'method':      _selectedMethod.toLowerCase().replaceAll(' ', '_'),
          'photo_url':   _uploadedPhotoUrl,
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
          onPressed: () => context.go('/salesman-dashboard'),
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
                        onTap: () =>
                            setState(() => _selectedMethod = method),
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
