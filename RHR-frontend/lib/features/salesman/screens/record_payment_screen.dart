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
import '../../../shared/customer_display.dart';

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

  // Cash is recorded at once; Bank Transfer waits for admin approval; a Cheque waits until the
  // bank clears it. All three land in Salesman Recovery (never the old Payments page).
  final List<String> _methods = ['Cash', 'Bank Transfer', 'Cheque'];

  // Cheque details — all four (amount is the field above) are required.
  final _chequeBankController   = TextEditingController();
  final _chequeNumberController = TextEditingController();
  DateTime? _chequeDate;

  // Bank Transfer specifics — backend only special-cases method=='bank'
  // (bank_account_id required), so the label above is display-only.
  List<Map<String, dynamic>> _bankAccounts = [];
  bool _loadingBankAccounts = false;
  String? _selectedBankAccountId;
  DateTime _transferDate = DateTime.now();

  // Opened standalone (e.g. the dashboard's "Record Payment" quick
  // action) instead of from a specific customer's page — needs its own
  // customer picker, same search-on-focus pattern as New Order's.
  String? _selectedCustomerId;
  List<Map<String, dynamic>> _customers = [];
  final _customerSearchController = TextEditingController();
  final _customerSearchFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _selectedCustomerId = widget.customerId;
    if (widget.customerId == null) _loadCustomers();
    _customerSearchFocus.addListener(() => setState(() {}));
  }

  Future<void> _loadCustomers() async {
    try {
      final res = await DioClient.instance.get(ApiEndpoints.customers);
      if (res.data['success'] == true && mounted) {
        setState(() => _customers = List<Map<String, dynamic>>.from(res.data['data'] ?? []));
      }
    } catch (e) {
      debugPrint('Customers load error: $e');
    }
  }

  List<Map<String, dynamic>> get _filteredCustomers {
    final q = _customerSearchController.text.trim().toLowerCase();
    if (q.isEmpty) return _customers;
    return _customers.where((c) {
      final name = customerSearchText(c);
      final phone = (c['phone'] ?? '').toString().toLowerCase();
      return name.contains(q) || phone.contains(q);
    }).toList();
  }

  Map<String, dynamic>? get _selectedCustomer => _selectedCustomerId == null
      ? null
      : _customers.firstWhere((c) => c['id'] == _selectedCustomerId, orElse: () => {});

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

  Future<void> _pickChequeDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _chequeDate ?? now,
      firstDate: now.subtract(const Duration(days: 365)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _chequeDate = picked);
  }

  @override
  void dispose() {
    _chequeBankController.dispose();
    _chequeNumberController.dispose();
    _amountController.dispose();
    _notesController.dispose();
    _customerSearchController.dispose();
    _customerSearchFocus.dispose();
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
    if (_selectedCustomerId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Select a customer first.')));
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
    if (_selectedMethod == 'Cheque' &&
        (_chequeBankController.text.trim().isEmpty ||
         _chequeNumberController.text.trim().isEmpty ||
         _chequeDate == null)) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Enter the cheque\'s bank name, cheque number and cheque date.')));
      return;
    }
    setState(() => _isLoading = true);
    try {
      final amount = double.parse(_amountController.text);
      final notes = _notesController.text.trim().isNotEmpty ? _notesController.text.trim() : null;

      // Cash and Bank Transfer both now post through the same
      // instant-credit recovery flow Cash Collection's own button
      // already used — Cash shows up in Cash In Hand, Bank Transfer
      // (never physical cash) shows straight in Deposit History
      // instead. Credit Account is the one case still going through
      // the admin-reviewed /payments table.
      late Response response;
      if (_selectedMethod == 'Cash') {
        response = await DioClient.instance.post(ApiEndpoints.recoveryTransactionsMe, data: {
          'customer_id': _selectedCustomerId,
          'amount': amount,
          'photo_url': _uploadedPhotoUrl,
          if (notes != null) 'notes': notes,
        });
      } else if (_selectedMethod == 'Bank Transfer') {
        final bankLabel = _bankAccounts.firstWhere(
            (a) => a['id'] == _selectedBankAccountId, orElse: () => {})['bank_name'];
        response = await DioClient.instance.post(ApiEndpoints.recoveryBankTransferMe, data: {
          'customer_id': _selectedCustomerId,
          'amount': amount,
          'bank_account_id': _selectedBankAccountId,
          if (bankLabel != null) 'bank_account_label': bankLabel,
          'photo_url': _uploadedPhotoUrl,
          if (notes != null) 'notes': notes,
        });
      } else {
        final d = _chequeDate!;
        response = await DioClient.instance.post(ApiEndpoints.recoveryChequeMe, data: {
          'customer_id': _selectedCustomerId,
          'amount': amount,
          'cheque_bank': _chequeBankController.text.trim(),
          'cheque_number': _chequeNumberController.text.trim(),
          'cheque_date': '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}',
          'photo_url': _uploadedPhotoUrl,
          if (notes != null) 'notes': notes,
        });
      }
      if (response.data['success'] == true) {
        if (mounted) {
          // A bank transfer waits for admin approval and a cheque for the bank to clear it; cash is recorded at once.
          await showSuccessCheck(context,
              message: _selectedMethod == 'Bank Transfer'
                  ? 'Submitted — pending approval'
                  : _selectedMethod == 'Cheque' ? 'Cheque saved — pending until it clears' : 'Payment Recorded!');
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

                  if (widget.customerId == null) ...[
                    const Text('Customer',
                        style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy)),
                    const SizedBox(height: 10),
                    if (_selectedCustomer != null && _selectedCustomer!['id'] != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                            color: AppColors.orange.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: AppColors.orange)),
                        child: Row(children: [
                          const Icon(Icons.business, color: AppColors.orange, size: 18),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(customerTitle(_selectedCustomer, fallback: ''),
                                style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy)),
                          ),
                          GestureDetector(
                            onTap: () => setState(() {
                              _selectedCustomerId = null;
                              _customerSearchController.clear();
                            }),
                            child: const Icon(Icons.close, color: AppColors.steelBlue, size: 18),
                          ),
                        ]),
                      )
                    else ...[
                      TextField(
                        controller: _customerSearchController,
                        focusNode: _customerSearchFocus,
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          hintText: 'Tap to see all customers, or search...',
                          prefixIcon: const Icon(Icons.search, color: AppColors.steelBlue),
                          filled: true,
                          fillColor: AppColors.warmGrey,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        ),
                      ),
                      if (_customerSearchFocus.hasFocus || _customerSearchController.text.trim().isNotEmpty)
                        Container(
                          margin: const EdgeInsets.only(top: 6),
                          constraints: const BoxConstraints(maxHeight: 220),
                          decoration: BoxDecoration(color: AppColors.warmGrey, borderRadius: BorderRadius.circular(10)),
                          child: _filteredCustomers.isEmpty
                              ? const Padding(
                                  padding: EdgeInsets.all(14),
                                  child: Text('No matching customers.', style: TextStyle(color: AppColors.steelBlue)))
                              : ListView.builder(
                                  shrinkWrap: true,
                                  itemCount: _filteredCustomers.length,
                                  itemBuilder: (_, i) {
                                    final c = _filteredCustomers[i];
                                    return ListTile(
                                      dense: true,
                                      title: Text(customerTitle(c, fallback: ''),
                                          style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.navy, fontSize: 13)),
                                      subtitle: Text(c['phone'] ?? '', style: const TextStyle(fontSize: 11)),
                                      onTap: () {
                                        _customerSearchFocus.unfocus();
                                        setState(() {
                                          _selectedCustomerId = c['id'] as String;
                                          _customerSearchController.text = customerTitle(c, fallback: '');
                                        });
                                      },
                                    );
                                  },
                                ),
                        ),
                    ],
                    const SizedBox(height: 24),
                  ],

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

                  if (_selectedMethod == 'Cheque') ...[
                    const SizedBox(height: 20),
                    RHRInputField(label: 'Bank Name', controller: _chequeBankController),
                    const SizedBox(height: 14),
                    RHRInputField(label: 'Cheque Number', controller: _chequeNumberController),
                    const SizedBox(height: 14),
                    const Text('Cheque Date',
                        style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy)),
                    const SizedBox(height: 10),
                    TapScale(
                      onTap: _pickChequeDate,
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                        decoration: BoxDecoration(color: AppColors.warmGrey, borderRadius: BorderRadius.circular(10)),
                        child: Row(children: [
                          const Icon(Icons.calendar_today_outlined, size: 18, color: AppColors.steelBlue),
                          const SizedBox(width: 10),
                          Text(
                            _chequeDate == null
                                ? 'Select cheque date'
                                : '${_chequeDate!.year}-${_chequeDate!.month.toString().padLeft(2, '0')}-${_chequeDate!.day.toString().padLeft(2, '0')}',
                            style: TextStyle(
                                color: _chequeDate == null ? AppColors.steelBlue : AppColors.navy,
                                fontWeight: FontWeight.w600),
                          ),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text('The cheque stays pending until the bank clears it — the customer\'s balance reduces only then.',
                        style: TextStyle(color: AppColors.steelBlue, fontSize: 12)),
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
