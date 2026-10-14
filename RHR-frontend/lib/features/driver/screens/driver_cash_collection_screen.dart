import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/router/app_transitions.dart';

/// Cash Collection Management — what a salesman has collected from
/// customers in cash (salesman_recoveries, auto-approved + credits the
/// customer's ledger immediately) and depositing that cash back to the
/// company (salesman_cash_closings — pending until an admin approves it,
/// either as a bank deposit with a slip photo, or handed over as petty
/// cash). "Cash in hand" is simply collected-minus-deposited.
class DriverCashCollectionScreen extends StatefulWidget {
  const DriverCashCollectionScreen({super.key});

  @override
  State<DriverCashCollectionScreen> createState() => _DriverCashCollectionScreenState();
}

class _DriverCashCollectionScreenState extends State<DriverCashCollectionScreen> {
  bool _loading = true;
  num _cashInHand = 0;
  num _totalCollected = 0;
  num _totalDeposited = 0;
  List<Map<String, dynamic>> _closingHistory = [];
  List<Map<String, dynamic>> _customers = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        DioClient.instance.get(ApiEndpoints.driverMyCashInHand),
        DioClient.instance.get(ApiEndpoints.driverCashClosingMe),
        DioClient.instance.get(ApiEndpoints.customers),
      ]);
      if (results[0].data['success'] == true) {
        final d = results[0].data['data'];
        _cashInHand = _asNum(d['cash_in_hand']);
        _totalCollected = _asNum(d['total_collected']);
        _totalDeposited = _asNum(d['total_deposited']);
      }
      if (results[1].data['success'] == true) {
        _closingHistory = List<Map<String, dynamic>>.from(results[1].data['data'] ?? []);
      }
      if (results[2].data['success'] == true) {
        _customers = List<Map<String, dynamic>>.from(results[2].data['data'] ?? []);
      }
    } catch (e) {
      debugPrint('Cash collection load error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  num _asNum(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '0') ?? 0;

  Future<void> _collectCash() async {
    String? customerId;
    final amountController = TextEditingController();
    final notesController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Collect Cash from Customer'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              value: customerId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Customer', border: OutlineInputBorder()),
              items: _customers.map((c) => DropdownMenuItem(
                value: c['id'] as String,
                child: Text(c['full_name'] ?? '', overflow: TextOverflow.ellipsis),
              )).toList(),
              onChanged: (v) => setDialogState(() => customerId = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: amountController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Amount (PKR)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: notesController,
              decoration: const InputDecoration(labelText: 'Notes (optional)', border: OutlineInputBorder()),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Submit')),
          ],
        ),
      ),
    );
    if (confirmed != true) return;
    if (customerId == null || amountController.text.trim().isEmpty) return;

    try {
      final res = await DioClient.instance.post(ApiEndpoints.driverRecoveryTransactionsMe, data: {
        'customer_id': customerId,
        'amount': double.tryParse(amountController.text.trim()) ?? 0,
        if (notesController.text.trim().isNotEmpty) 'notes': notesController.text.trim(),
      });
      if (res.data['success'] == true) {
        if (mounted) await showSuccessCheck(context, message: 'Cash Collected!');
        _load();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res.data['message'] ?? 'Failed')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> _depositDialog() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetContext) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Deposit Cash', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: AppColors.navy)),
          const SizedBox(height: 16),
          ListTile(
            leading: const Icon(Icons.payments_outlined, color: AppColors.orange),
            title: const Text('Via Cash (hand over to branch)'),
            subtitle: const Text('Submits directly for admin approval'),
            onTap: () => Navigator.pop(sheetContext, 'cash'),
          ),
          ListTile(
            leading: const Icon(Icons.account_balance_outlined, color: AppColors.orange),
            title: const Text('Via Bank Transfer'),
            subtitle: const Text('Requires a bank slip photo'),
            onTap: () => Navigator.pop(sheetContext, 'bank'),
          ),
        ]),
      ),
    );
    if (choice == 'cash') await _submitCashDeposit();
    if (choice == 'bank') await _submitBankDeposit();
  }

  Future<void> _submitCashDeposit() async {
    final amountController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Deposit Via Cash'),
        content: TextField(
          controller: amountController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Amount (PKR)', border: OutlineInputBorder()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Submit')),
        ],
      ),
    );
    if (confirmed != true || amountController.text.trim().isEmpty) return;

    try {
      final res = await DioClient.instance.post(ApiEndpoints.driverCashClosingMe, data: {
        'amount': double.tryParse(amountController.text.trim()) ?? 0,
        'deposit_to': 'cash',
      });
      if (res.data['success'] == true) {
        if (mounted) await showSuccessCheck(context, message: 'Deposit Submitted!');
        _load();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res.data['message'] ?? 'Failed')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> _submitBankDeposit() async {
    final bankController = TextEditingController();
    final amountController = TextEditingController();
    File? slipFile;
    String? uploadedSlipUrl;
    bool uploading = false;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Deposit Via Bank'),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Date: ${DateTime.now().toString().split(' ')[0]} (today, locked)',
                style: const TextStyle(color: AppColors.steelBlue, fontSize: 12)),
            const SizedBox(height: 10),
            TextField(
              controller: bankController,
              decoration: const InputDecoration(labelText: 'Bank Name', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: amountController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Amount (PKR)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: uploading ? null : () async {
                final picker = ImagePicker();
                final image = await picker.pickImage(source: ImageSource.camera, imageQuality: 70);
                if (image == null) return;
                setDialogState(() => uploading = true);
                try {
                  slipFile = File(image.path);
                  final bytes = await slipFile!.readAsBytes();
                  final res = await DioClient.instance.post(ApiEndpoints.storageUpload, data: {
                    'bucket': 'payment-proofs',
                    'fileName': 'slip_${DateTime.now().millisecondsSinceEpoch}.jpg',
                    'fileBase64': base64Encode(bytes),
                    'mimeType': 'image/jpeg',
                  });
                  if (res.data['success'] == true) {
                    uploadedSlipUrl = res.data['data']['url'] as String?;
                  }
                } catch (e) {
                  debugPrint('Slip upload error: $e');
                } finally {
                  setDialogState(() => uploading = false);
                }
              },
              icon: Icon(uploadedSlipUrl != null ? Icons.check_circle : Icons.camera_alt_outlined,
                  color: uploadedSlipUrl != null ? AppColors.success : AppColors.navy),
              label: Text(uploading ? 'Uploading...' : (uploadedSlipUrl != null ? 'Slip uploaded' : 'Upload Bank Slip *')),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Submit')),
          ],
        ),
      ),
    );
    if (confirmed != true) return;
    if (amountController.text.trim().isEmpty || uploadedSlipUrl == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Amount and bank slip photo are required.')));
      }
      return;
    }

    try {
      final res = await DioClient.instance.post(ApiEndpoints.driverCashClosingMe, data: {
        'amount': double.tryParse(amountController.text.trim()) ?? 0,
        'deposit_to': 'bank',
        'bank_account': bankController.text.trim(),
        'slip_image_url': uploadedSlipUrl,
      });
      if (res.data['success'] == true) {
        if (mounted) await showSuccessCheck(context, message: 'Deposit Submitted!');
        _load();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res.data['message'] ?? 'Failed')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: () => goBack(context, '/driver-dashboard')),
        title: const Text('Cash Collection', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(padding: const EdgeInsets.all(20), children: [
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(16)),
                  child: Column(children: [
                    const Text('Cash In Hand', style: TextStyle(color: Colors.white70, fontSize: 13)),
                    const SizedBox(height: 6),
                    Text('PKR ${_cashInHand.toStringAsFixed(0)}',
                        style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 14),
                    Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
                      Column(children: [
                        Text('PKR ${_totalCollected.toStringAsFixed(0)}',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                        const Text('Collected', style: TextStyle(color: Colors.white54, fontSize: 11)),
                      ]),
                      Column(children: [
                        Text('PKR ${_totalDeposited.toStringAsFixed(0)}',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                        const Text('Deposited', style: TextStyle(color: Colors.white54, fontSize: 11)),
                      ]),
                    ]),
                  ]),
                ),
                const SizedBox(height: 16),
                Row(children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _collectCash,
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.success, foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14)),
                      icon: const Icon(Icons.add),
                      label: const Text('Collect Cash'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _depositDialog,
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.orange, foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14)),
                      icon: const Icon(Icons.upload_outlined),
                      label: const Text('Deposit'),
                    ),
                  ),
                ]),
                const SizedBox(height: 24),
                const Text('Deposit History', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 16)),
                const SizedBox(height: 10),
                if (_closingHistory.isEmpty)
                  const Padding(padding: EdgeInsets.all(16),
                      child: Text('No deposits yet.', style: TextStyle(color: AppColors.steelBlue)))
                else
                  ..._closingHistory.map((c) => Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(12)),
                        child: Row(children: [
                          Icon(c['deposit_to'] == 'bank' ? Icons.account_balance_outlined : Icons.payments_outlined,
                              color: AppColors.orange),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text('PKR ${_asNum(c['amount']).toStringAsFixed(0)} — ${c['deposit_to']}',
                                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy)),
                              Text('${c['closing_date']}', style: const TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                            ]),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: (c['status'] == 'approved' ? AppColors.success : AppColors.orange).withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(c['status'] ?? '',
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold,
                                    color: c['status'] == 'approved' ? AppColors.success : AppColors.orange)),
                          ),
                        ]),
                      )),
              ]),
            ),
    );
  }
}
