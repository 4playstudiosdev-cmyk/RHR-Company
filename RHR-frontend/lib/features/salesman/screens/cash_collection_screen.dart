import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import '../../../shared/customer_display.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/router/app_transitions.dart';
import '../../../shared/widgets/premium_ui.dart';

class CashCollectionScreen extends StatefulWidget {
  const CashCollectionScreen({super.key});

  @override
  State<CashCollectionScreen> createState() => _CashCollectionScreenState();
}

class _CashCollectionScreenState extends State<CashCollectionScreen> {
  bool _loading = true;
  num _cashInHand = 0;
  num _totalCollected = 0;
  num _totalDeposited = 0;
  List<Map<String, dynamic>> _closingHistory = [];
  List<Map<String, dynamic>> _bankTransfers = [];
  String _historyRange = 'Today';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        DioClient.instance.get(ApiEndpoints.recoveryMyCashInHand),
        DioClient.instance.get(ApiEndpoints.recoveryCashClosingMe),
        DioClient.instance.get(ApiEndpoints.recoveryBankTransfersMe),
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
        _bankTransfers = List<Map<String, dynamic>>.from(results[2].data['data'] ?? []);
      }
    } catch (e) {
      debugPrint('Cash collection load error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  num _asNum(dynamic v) => v is num ? v : num.tryParse(v?.toString() ?? '0') ?? 0;

  num get _totalBankTransferred => _bankTransfers.fold<num>(0, (s, t) => s + _asNum(t['amount']));

  DateTimeRange _rangeFor(String label) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    switch (label) {
      case 'Today':
        return DateTimeRange(start: today, end: today.add(const Duration(days: 1)));
      case 'Yesterday':
        return DateTimeRange(start: today.subtract(const Duration(days: 1)), end: today);
      case 'Last 7 Days':
        return DateTimeRange(start: today.subtract(const Duration(days: 6)), end: today.add(const Duration(days: 1)));
      case 'This Month':
        return DateTimeRange(start: DateTime(now.year, now.month, 1), end: today.add(const Duration(days: 1)));
      default:
        return DateTimeRange(start: DateTime(2000), end: today.add(const Duration(days: 1)));
    }
  }

  bool _inRange(String? dateStr) {
    if (dateStr == null) return false;
    final d = DateTime.tryParse(dateStr);
    if (d == null) return false;
    final r = _rangeFor(_historyRange);
    return !d.isBefore(r.start) && d.isBefore(r.end);
  }

  List<Map<String, dynamic>> get _combinedHistory {
    final combined = [
      ..._closingHistory.map((c) => {
            'amount': c['amount'],
            'date': c['closing_date'],
            'status': c['status'],
            'isBank': c['deposit_to'] == 'bank',
            'label': c['deposit_to'] == 'bank' ? 'Cash Deposit — Bank' : 'Cash Deposit — Petty Cash',
          }),
      ..._bankTransfers.map((t) => {
            'amount': t['amount'],
            'date': t['recovery_date'],
            'status': t['status'],
            'isBank': true,
            'label': 'Bank Transfer from ${customerTitle(t['users'] as Map?, fallback: 'customer')}',
          }),
    ];
    combined.sort((a, b) => (b['date'] ?? '').toString().compareTo((a['date'] ?? '').toString()));
    if (_historyRange == 'All Time') return combined;
    return combined.where((c) => _inRange(c['date'] as String?)).toList();
  }

  num get _filteredCollected {
    if (_historyRange == 'All Time') return _totalCollected;
    return _combinedHistory.fold<num>(0, (s, c) => s + _asNum(c['amount']));
  }

  num get _filteredDeposited {
    if (_historyRange == 'All Time') return _totalDeposited + _totalBankTransferred;
    return _combinedHistory
        .where((c) => (c['status'] ?? '') == 'approved')
        .fold<num>(0, (s, c) => s + _asNum(c['amount']));
  }

  Future<void> _depositDialog() async {
    if (_cashInHand <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('You have no cash in hand to deposit.')));
      return;
    }
    if (_closingHistory.any((c) => (c['status'] ?? '') == 'pending')) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('You already have a deposit waiting for admin approval.')));
      return;
    }
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.all(20),
        child: SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.only(bottom: 18),
              decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2)),
            ),
            const Text('Deposit Cash', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: kNavy)),
            const SizedBox(height: 16),
            ListTile(
              leading: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.payments_outlined, color: kNavy, size: 20),
              ),
              title: const Text('Via Cash', style: TextStyle(fontWeight: FontWeight.w700, color: kNavy)),
              subtitle: const Text('Hand over to branch — submits directly'),
              onTap: () => Navigator.pop(sheetContext, 'cash'),
            ),
            ListTile(
              leading: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.account_balance_outlined, color: kNavy, size: 20),
              ),
              title: const Text('Via Bank Transfer', style: TextStyle(fontWeight: FontWeight.w700, color: kNavy)),
              subtitle: const Text('Requires a bank slip photo'),
              onTap: () => Navigator.pop(sheetContext, 'bank'),
            ),
          ]),
        ),
      ),
    );
    if (choice == 'cash') await _submitCashDeposit();
    if (choice == 'bank') await _submitBankDeposit();
  }

  String _depositAmountText() =>
      _cashInHand == _cashInHand.roundToDouble() ? _cashInHand.toStringAsFixed(0) : _cashInHand.toStringAsFixed(2);

  Future<void> _submitCashDeposit() async {
    final amountController = TextEditingController(text: _depositAmountText());
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Deposit Via Cash', style: TextStyle(color: kNavy, fontWeight: FontWeight.w700)),
        content: TextField(
          controller: amountController,
          keyboardType: TextInputType.number,
          readOnly: true,
          decoration: InputDecoration(
            labelText: 'Amount (PKR) — your full cash in hand',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            filled: true,
            fillColor: kCardBg,
            suffixIcon: const Icon(Icons.lock_outline, size: 18, color: kTextMuted),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: ElevatedButton.styleFrom(backgroundColor: kNavy, foregroundColor: Colors.white),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    if (confirmed != true || amountController.text.trim().isEmpty) return;

    try {
      final res = await DioClient.instance.post(ApiEndpoints.recoveryCashClosingMe, data: {
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
    final amountController = TextEditingController(text: _depositAmountText());
    File? slipFile;
    String? uploadedSlipUrl;
    bool uploading = false;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Deposit Via Bank', style: TextStyle(color: kNavy, fontWeight: FontWeight.w700)),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Date: ${DateTime.now().toString().split(' ')[0]} (today, locked)',
                style: const TextStyle(color: kTextMuted, fontSize: 12)),
            const SizedBox(height: 10),
            TextField(
              controller: bankController,
              decoration: InputDecoration(
                labelText: 'Bank Name',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                prefixIcon: const Icon(Icons.account_balance_rounded, color: kTextMuted, size: 20),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: amountController,
              keyboardType: TextInputType.number,
              readOnly: true,
              decoration: InputDecoration(
                labelText: 'Amount (PKR) — your full cash in hand',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                filled: true,
                fillColor: kCardBg,
                suffixIcon: const Icon(Icons.lock_outline, size: 18, color: kTextMuted),
              ),
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
              style: OutlinedButton.styleFrom(foregroundColor: kNavy, side: const BorderSide(color: Color(0xFFE0E5EF))),
              icon: Icon(uploadedSlipUrl != null ? Icons.check_circle_rounded : Icons.camera_alt_rounded,
                  color: uploadedSlipUrl != null ? kGreen : kNavy),
              label: Text(uploading ? 'Uploading...' : (uploadedSlipUrl != null ? 'Slip uploaded ✓' : 'Upload Bank Slip *')),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              style: ElevatedButton.styleFrom(backgroundColor: kNavy, foregroundColor: Colors.white),
              child: const Text('Submit'),
            ),
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
      final res = await DioClient.instance.post(ApiEndpoints.recoveryCashClosingMe, data: {
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
      backgroundColor: kCardBg,
      appBar: premiumAppBar(
        'Cash Collection',
        subtitle: 'Collected · Deposited · In Hand',
        onBack: () => goBack(context, '/salesman-dashboard'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: kNavy))
          : RefreshIndicator(
              color: kGreen,
              onRefresh: _load,
              child: ListView(padding: const EdgeInsets.all(16), children: [
                // Summary card
                Container(
                  padding: const EdgeInsets.all(22),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [kNavyDark, kNavyLight],
                    ),
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: [BoxShadow(color: kNavy.withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 6))],
                  ),
                  child: Column(children: [
                    const Text('Cash In Hand', style: TextStyle(color: Colors.white54, fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    Text('PKR ${_cashInHand.toStringAsFixed(0)}',
                        style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 16),
                    Row(children: [
                      Expanded(child: _statPill('Collected', 'PKR ${_filteredCollected.toStringAsFixed(0)}', kGreen)),
                      const SizedBox(width: 10),
                      Expanded(child: _statPill('Deposited', 'PKR ${_filteredDeposited.toStringAsFixed(0)}', Colors.white70)),
                    ]),
                  ]),
                ),

                const SizedBox(height: 16),

                PremiumButton(
                  text: 'Deposit Cash',
                  onPressed: _depositDialog,
                  icon: Icons.upload_outlined,
                ),

                const SizedBox(height: 24),

                Row(
                  children: [
                    const Expanded(child: SectionHeader(title: 'Deposit History')),
                  ],
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 34,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: ['Today', 'Yesterday', 'Last 7 Days', 'This Month', 'All Time'].map((label) {
                      final active = _historyRange == label;
                      return GestureDetector(
                        onTap: () => setState(() => _historyRange = label),
                        child: Container(
                          margin: const EdgeInsets.only(right: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                          decoration: BoxDecoration(
                            color: active ? kNavy : Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: active ? kNavy : const Color(0xFFDDE3EF)),
                          ),
                          child: Text(label,
                              style: TextStyle(
                                  color: active ? Colors.white : kNavy,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12)),
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 12),

                if (_combinedHistory.isEmpty)
                  const PremiumEmpty(icon: Icons.history_rounded, title: 'No deposits yet')
                else
                  ..._combinedHistory.map((c) {
                    final isApproved = (c['status'] ?? '') == 'approved';
                    final isBank = c['isBank'] == true;
                    return PremiumCard(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: Row(children: [
                        Container(
                          width: 42, height: 42,
                          decoration: BoxDecoration(
                            color: (isBank ? const Color(0xFF1565C0) : kGreen).withValues(alpha: 0.10),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            isBank ? Icons.account_balance_rounded : Icons.payments_rounded,
                            color: isBank ? const Color(0xFF1565C0) : kGreen,
                            size: 20,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('PKR ${_asNum(c['amount']).toStringAsFixed(0)}',
                              style: const TextStyle(fontWeight: FontWeight.w800, color: kNavy, fontSize: 14)),
                          Text(c['label'] as String? ?? '',
                              style: const TextStyle(color: kTextMuted, fontSize: 11)),
                          Text('${c['date']}', style: const TextStyle(color: kTextMuted, fontSize: 11)),
                        ])),
                        StatusBadge(c['status'] as String? ?? '', isApproved ? kGreen : kAmber),
                      ]),
                    );
                  }),
              ]),
            ),
    );
  }

  Widget _statPill(String label, String value, Color valueColor) => Container(
    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.10),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Column(children: [
      Text(value, style: TextStyle(color: valueColor, fontWeight: FontWeight.w700, fontSize: 13)),
      const SizedBox(height: 2),
      Text(label, style: const TextStyle(color: Colors.white38, fontSize: 10)),
    ]),
  );
}
