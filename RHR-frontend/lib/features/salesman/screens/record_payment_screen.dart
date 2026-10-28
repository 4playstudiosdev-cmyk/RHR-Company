import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/widgets/tap_scale.dart';
import '../../../shared/widgets/premium_ui.dart';
import '../../../shared/router/app_transitions.dart';
import '../../../shared/customer_display.dart';

class RecordPaymentScreen extends StatefulWidget {
  final String? customerId;
  const RecordPaymentScreen({super.key, this.customerId});

  @override
  State<RecordPaymentScreen> createState() => _RecordPaymentScreenState();
}

class _RecordPaymentScreenState extends State<RecordPaymentScreen> {
  final _amountController        = TextEditingController();
  final _notesController         = TextEditingController();
  final _chequeBankController    = TextEditingController();
  final _chequeNumberController  = TextEditingController();
  final _customerSearchController = TextEditingController();
  final _customerSearchFocus      = FocusNode();

  String  _selectedMethod   = 'Cash';
  bool    _photoUploaded    = false;
  bool    _isLoading        = false;
  String? _uploadedPhotoUrl;
  DateTime? _chequeDate;

  final List<String> _methods = ['Cash', 'Bank Transfer', 'Cheque'];

  List<Map<String, dynamic>> _bankAccounts = [];
  bool _loadingBankAccounts = false;
  String? _selectedBankAccountId;
  DateTime _transferDate = DateTime.now();

  String? _selectedCustomerId;
  List<Map<String, dynamic>> _customers = [];

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
      final name  = customerSearchText(c);
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
      builder: (ctx) => Container(
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
              onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
            ),
            ListTile(
              leading: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.photo_library_rounded, color: kNavy, size: 20),
              ),
              title: const Text('Choose from Gallery', style: TextStyle(fontWeight: FontWeight.w600, color: kNavy)),
              onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
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
      } else {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Photo upload failed. Try again.')));
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
    if (_selectedCustomerId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select a customer first.')));
      return;
    }
    if (_amountController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please enter an amount.')));
      return;
    }
    if (_uploadedPhotoUrl == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please upload a payment photo.')));
      return;
    }
    if (_selectedMethod == 'Bank Transfer' && _selectedBankAccountId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please select which bank account it went to.')));
      return;
    }
    if (_selectedMethod == 'Cheque' &&
        (_chequeBankController.text.trim().isEmpty ||
         _chequeNumberController.text.trim().isEmpty ||
         _chequeDate == null)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Enter the cheque's bank name, cheque number and cheque date.")));
      return;
    }
    setState(() => _isLoading = true);
    try {
      final amount = double.parse(_amountController.text);
      final notes  = _notesController.text.trim().isNotEmpty ? _notesController.text.trim() : null;

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
          await showSuccessCheck(context,
              message: _selectedMethod == 'Bank Transfer'
                  ? 'Submitted — pending approval'
                  : _selectedMethod == 'Cheque'
                      ? 'Cheque saved — pending until it clears'
                      : 'Payment Recorded!');
          if (mounted) context.go('/salesman-dashboard');
        }
      } else {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(response.data['message'] ?? 'Payment failed')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Payment failed: $e')));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCardBg,
      appBar: premiumAppBar(
        'Record Payment',
        subtitle: 'Cash · Bank Transfer · Cheque',
        onBack: () => goBack(context, '/salesman-dashboard'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

          // ── Customer picker ──────────────────────────────────────────────
          if (widget.customerId == null) ...[
            _fieldLabel('Customer'),
            const SizedBox(height: 8),
            if (_selectedCustomer != null && _selectedCustomer!['id'] != null)
              PremiumCard(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                margin: EdgeInsets.zero,
                child: Row(children: [
                  Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
                    child: const Icon(Icons.business_rounded, color: kNavy, size: 18),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(customerTitle(_selectedCustomer, fallback: ''),
                        style: const TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 14)),
                  ),
                  GestureDetector(
                    onTap: () => setState(() { _selectedCustomerId = null; _customerSearchController.clear(); }),
                    child: const Icon(Icons.close_rounded, color: kTextMuted, size: 18),
                  ),
                ]),
              )
            else ...[
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                      color: _customerSearchFocus.hasFocus ? kNavy : const Color(0xFFE0E5EF),
                      width: _customerSearchFocus.hasFocus ? 1.5 : 1),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
                ),
                child: TextField(
                  controller: _customerSearchController,
                  focusNode: _customerSearchFocus,
                  onChanged: (_) => setState(() {}),
                  style: const TextStyle(color: kNavy, fontSize: 14),
                  decoration: const InputDecoration(
                    hintText: 'Search customer by name or phone...',
                    hintStyle: TextStyle(color: kTextMuted, fontSize: 13),
                    prefixIcon: Icon(Icons.search_rounded, color: kTextMuted, size: 20),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                  ),
                ),
              ),
              if (_customerSearchFocus.hasFocus || _customerSearchController.text.trim().isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  constraints: const BoxConstraints(maxHeight: 220),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE0E5EF)),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
                  ),
                  child: _filteredCustomers.isEmpty
                      ? const Padding(
                          padding: EdgeInsets.all(16),
                          child: Text('No matching customers.', style: TextStyle(color: kTextMuted)))
                      : ListView.builder(
                          shrinkWrap: true,
                          itemCount: _filteredCustomers.length,
                          itemBuilder: (_, i) {
                            final c = _filteredCustomers[i];
                            return ListTile(
                              dense: true,
                              leading: CircleAvatar(
                                radius: 16,
                                backgroundColor: kNavy.withValues(alpha: 0.07),
                                child: Text(
                                  customerTitle(c, fallback: '?').isNotEmpty ? customerTitle(c, fallback: '?')[0].toUpperCase() : '?',
                                  style: const TextStyle(color: kNavy, fontSize: 12, fontWeight: FontWeight.w700),
                                ),
                              ),
                              title: Text(customerTitle(c, fallback: ''),
                                  style: const TextStyle(fontWeight: FontWeight.w600, color: kNavy, fontSize: 13)),
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
            const SizedBox(height: 20),
          ],

          // ── Amount ───────────────────────────────────────────────────────
          _fieldLabel('Amount Collected'),
          const SizedBox(height: 8),
          _amountField(),
          const SizedBox(height: 20),

          // ── Payment method ───────────────────────────────────────────────
          _fieldLabel('Payment Method'),
          const SizedBox(height: 10),
          Row(children: _methods.asMap().entries.map((e) {
            final method   = e.value;
            final selected = _selectedMethod == method;
            final icons    = [Icons.payments_rounded, Icons.account_balance_rounded, Icons.assignment_outlined];
            return Expanded(
              child: Padding(
                padding: EdgeInsets.only(right: e.key < 2 ? 8 : 0),
                child: TapScale(
                  onTap: () {
                    setState(() => _selectedMethod = method);
                    if (method == 'Bank Transfer') _loadBankAccounts();
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: selected ? kNavy : Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: selected ? kNavy : const Color(0xFFE0E5EF)),
                      boxShadow: selected
                          ? [BoxShadow(color: kNavy.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 3))]
                          : [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 4)],
                    ),
                    child: Column(children: [
                      Icon(icons[e.key], color: selected ? Colors.white : kNavy, size: 20),
                      const SizedBox(height: 4),
                      Text(method,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: selected ? Colors.white : kNavy,
                              fontWeight: FontWeight.w700,
                              fontSize: 11)),
                    ]),
                  ),
                ),
              ),
            );
          }).toList()),

          // ── Bank Transfer fields ─────────────────────────────────────────
          if (_selectedMethod == 'Bank Transfer') ...[
            const SizedBox(height: 20),
            _fieldLabel('Bank Account'),
            const SizedBox(height: 8),
            _loadingBankAccounts
                ? const Center(child: Padding(
                    padding: EdgeInsets.all(8),
                    child: CircularProgressIndicator(strokeWidth: 2, color: kNavy)))
                : _dropdownField(
                    hint: _bankAccounts.isEmpty ? 'No bank accounts set up' : 'Select account',
                    value: _selectedBankAccountId,
                    items: _bankAccounts.map((a) => DropdownMenuItem(
                      value: a['id'] as String,
                      child: Text('${a['bank_name']} — ${a['account_name']}', overflow: TextOverflow.ellipsis),
                    )).toList(),
                    onChanged: (v) => setState(() => _selectedBankAccountId = v),
                  ),
            const SizedBox(height: 16),
            _fieldLabel('Transfer Date'),
            const SizedBox(height: 8),
            _datePicker(
              label: '${_transferDate.year}-${_transferDate.month.toString().padLeft(2, '0')}-${_transferDate.day.toString().padLeft(2, '0')}',
              onTap: _pickTransferDate,
            ),
          ],

          // ── Cheque fields ────────────────────────────────────────────────
          if (_selectedMethod == 'Cheque') ...[
            const SizedBox(height: 20),
            PremiumInput(label: 'Bank Name', hint: 'e.g. HBL, MCB', controller: _chequeBankController, prefixIcon: Icons.account_balance_rounded),
            const SizedBox(height: 14),
            PremiumInput(label: 'Cheque Number', hint: 'e.g. 001234', controller: _chequeNumberController, prefixIcon: Icons.tag_rounded),
            const SizedBox(height: 14),
            _fieldLabel('Cheque Date'),
            const SizedBox(height: 8),
            _datePicker(
              label: _chequeDate == null
                  ? 'Select cheque date'
                  : '${_chequeDate!.year}-${_chequeDate!.month.toString().padLeft(2, '0')}-${_chequeDate!.day.toString().padLeft(2, '0')}',
              onTap: _pickChequeDate,
              isEmpty: _chequeDate == null,
            ),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: kAmber.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(8)),
              child: const Row(children: [
                Icon(Icons.info_outline_rounded, size: 14, color: kAmber),
                SizedBox(width: 6),
                Expanded(child: Text(
                  "Cheque stays pending until the bank clears it — customer's balance reduces only then.",
                  style: TextStyle(color: kAmber, fontSize: 11),
                )),
              ]),
            ),
          ],

          const SizedBox(height: 20),

          // ── Notes ────────────────────────────────────────────────────────
          PremiumInput(
            label: 'Notes (optional)',
            hint: 'Any additional info...',
            controller: _notesController,
            prefixIcon: Icons.notes_rounded,
          ),
          const SizedBox(height: 20),

          // ── Photo upload ─────────────────────────────────────────────────
          _fieldLabel('Payment Photo Proof'),
          const SizedBox(height: 4),
          const Text('Required — take a photo of the cash / receipt',
              style: TextStyle(color: kTextMuted, fontSize: 12)),
          const SizedBox(height: 10),
          TapScale(
            onTap: _isLoading ? null : _pickAndUploadPhoto,
            child: Container(
              width: double.infinity,
              height: 120,
              decoration: BoxDecoration(
                color: _photoUploaded ? kGreen.withValues(alpha: 0.06) : Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: _photoUploaded ? kGreen : const Color(0xFFE0E5EF),
                  width: _photoUploaded ? 2 : 1.5,
                ),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
              ),
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator(color: kNavy))
                  : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Container(
                        width: 48, height: 48,
                        decoration: BoxDecoration(
                          color: (_photoUploaded ? kGreen : kNavy).withValues(alpha: 0.08),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          _photoUploaded ? Icons.check_circle_rounded : Icons.camera_alt_rounded,
                          color: _photoUploaded ? kGreen : kNavy,
                          size: 26,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _photoUploaded ? 'Photo uploaded ✓' : 'Tap to take photo',
                        style: TextStyle(
                          color: _photoUploaded ? kGreen : kNavy,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ]),
            ),
          ),

          const SizedBox(height: 28),

          // ── Submit ───────────────────────────────────────────────────────
          PremiumButton(
            text: _selectedMethod == 'Cheque' ? 'Save Cheque' : 'Submit Payment',
            onPressed: _submitPayment,
            isLoading: _isLoading,
            icon: _selectedMethod == 'Cheque' ? Icons.assignment_outlined : Icons.send_rounded,
          ),
          const SizedBox(height: 20),
        ]),
      ),
    );
  }

  Widget _fieldLabel(String text) =>
      Text(text, style: const TextStyle(color: kNavy, fontSize: 13, fontWeight: FontWeight.w700));

  Widget _amountField() => Container(
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFFE0E5EF)),
      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
    ),
    child: Row(children: [
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: const BoxDecoration(
          border: Border(right: BorderSide(color: Color(0xFFE0E5EF))),
        ),
        child: const Text('PKR', style: TextStyle(color: kNavy, fontWeight: FontWeight.w700, fontSize: 14)),
      ),
      Expanded(
        child: TextField(
          controller: _amountController,
          keyboardType: TextInputType.number,
          style: const TextStyle(color: kNavy, fontSize: 18, fontWeight: FontWeight.w700),
          decoration: const InputDecoration(
            hintText: '0',
            hintStyle: TextStyle(color: kTextMuted, fontSize: 18),
            border: InputBorder.none,
            contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          ),
        ),
      ),
    ]),
  );

  Widget _datePicker({required String label, required VoidCallback onTap, bool isEmpty = false}) =>
      TapScale(
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE0E5EF)),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)],
          ),
          child: Row(children: [
            const Icon(Icons.calendar_today_rounded, size: 17, color: kTextMuted),
            const SizedBox(width: 10),
            Text(label,
                style: TextStyle(
                    color: isEmpty ? kTextMuted : kNavy,
                    fontWeight: FontWeight.w600,
                    fontSize: 14)),
          ]),
        ),
      );

  Widget _dropdownField<T>({
    required String hint,
    required T? value,
    required List<DropdownMenuItem<T>> items,
    required ValueChanged<T?> onChanged,
  }) =>
      DropdownButtonFormField<T>(
        value: value,
        isExpanded: true,
        decoration: InputDecoration(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE0E5EF))),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE0E5EF))),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: kNavy, width: 1.5)),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          hintText: hint,
        ),
        items: items,
        onChanged: onChanged,
      );
}
