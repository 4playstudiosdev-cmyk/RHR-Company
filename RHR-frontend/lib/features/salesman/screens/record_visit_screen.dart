import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/location/location_service.dart';
import '../../../shared/customer_display.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/router/app_transitions.dart';
import '../../../shared/widgets/premium_ui.dart';

class RecordVisitScreen extends StatefulWidget {
  const RecordVisitScreen({super.key});

  @override
  State<RecordVisitScreen> createState() => _RecordVisitScreenState();
}

class _RecordVisitScreenState extends State<RecordVisitScreen> {
  List<Map<String, dynamic>> _customers = [];
  bool _loadingCustomers = true;
  String? _selectedCustomerId;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadCustomers();
  }

  Future<void> _loadCustomers() async {
    try {
      final res = await DioClient.instance.get(ApiEndpoints.customers);
      if (res.data['success'] == true) {
        setState(() => _customers = List<Map<String, dynamic>>.from(res.data['data'] ?? []));
      }
    } catch (e) {
      debugPrint('Customers load error: $e');
    } finally {
      if (mounted) setState(() => _loadingCustomers = false);
    }
  }

  Future<void> _onVisitDone() async {
    if (_selectedCustomerId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Select a customer first.')));
      return;
    }
    final notesController = TextEditingController();
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: EdgeInsets.only(
          left: 20, right: 20, top: 20,
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 20,
        ),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Center(
            child: Container(
              width: 40, height: 4,
              margin: const EdgeInsets.only(bottom: 18),
              decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const Text('Visit Notes', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: kNavy)),
          const SizedBox(height: 4),
          const Text('Required — what happened during this visit?',
              style: TextStyle(color: kTextMuted, fontSize: 12)),
          const SizedBox(height: 16),
          Container(
            decoration: BoxDecoration(
              color: kCardBg,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE0E5EF)),
            ),
            child: TextField(
              controller: notesController,
              maxLines: 4,
              autofocus: true,
              style: const TextStyle(color: kNavy, fontSize: 14),
              decoration: const InputDecoration(
                hintText: 'e.g. Discussed new stock, customer wants a discount...',
                hintStyle: TextStyle(color: kTextMuted, fontSize: 13),
                border: InputBorder.none,
                contentPadding: EdgeInsets.all(14),
              ),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () {
                if (notesController.text.trim().isEmpty) {
                  ScaffoldMessenger.of(sheetContext).showSnackBar(
                      const SnackBar(content: Text('Notes are required to mark this visit done.')));
                  return;
                }
                Navigator.of(sheetContext).pop(true);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: kGreen, foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              icon: const Icon(Icons.check_circle_rounded, size: 18),
              label: const Text('Visit Done', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            ),
          ),
        ]),
      ),
    );
    if (confirmed == true) await _submit(notesController.text.trim());
  }

  Future<void> _submit(String notes) async {
    setState(() => _submitting = true);
    try {
      final pos = await LocationService.getPositionForVisit();
      final res = await DioClient.instance.post(ApiEndpoints.visits, data: {
        'customer_id': _selectedCustomerId,
        'notes': notes,
        if (pos != null) 'latitude': pos.latitude,
        if (pos != null) 'longitude': pos.longitude,
        if (pos != null) 'accuracy': pos.accuracy,
      });
      if (res.data['success'] == true) {
        if (mounted) {
          await showSuccessCheck(context, message: 'Visit Logged!');
          if (mounted) context.pushReplacement('/visit-history');
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(res.data['message'] ?? 'Failed to log visit')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCardBg,
      appBar: premiumAppBar(
        'Record Customer Visit',
        subtitle: 'Timestamp is captured automatically',
        onBack: () => goBack(context, '/salesman-dashboard'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Timestamp info card
          PremiumCard(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            margin: const EdgeInsets.only(bottom: 20),
            child: Row(children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.schedule_rounded, size: 20, color: kNavy),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Text(
                  'Date & time are recorded automatically when you tap Visit Done',
                  style: TextStyle(color: kNavy, fontWeight: FontWeight.w600, fontSize: 13),
                ),
              ),
            ]),
          ),

          // Customer picker
          const Text('Customer', style: TextStyle(color: kNavy, fontSize: 13, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          _loadingCustomers
              ? const Center(child: Padding(
                  padding: EdgeInsets.all(8),
                  child: CircularProgressIndicator(strokeWidth: 2, color: kNavy)))
              : DropdownButtonFormField<String>(
                  value: _selectedCustomerId,
                  isExpanded: true,
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: Colors.white,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE0E5EF))),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE0E5EF))),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: kNavy, width: 1.5)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                    hintText: 'Select customer',
                    prefixIcon: const Icon(Icons.store_rounded, color: kTextMuted, size: 20),
                  ),
                  items: _customers.map((c) => DropdownMenuItem(
                    value: c['id'] as String,
                    child: Text(customerTitle(c), overflow: TextOverflow.ellipsis),
                  )).toList(),
                  onChanged: (v) => setState(() => _selectedCustomerId = v),
                ),

          const SizedBox(height: 28),

          PremiumButton(
            text: 'Mark Visit Done',
            onPressed: _onVisitDone,
            isLoading: _submitting,
            icon: Icons.check_circle_rounded,
          ),
        ]),
      ),
    );
  }
}
