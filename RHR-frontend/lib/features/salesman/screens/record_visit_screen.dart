import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/location/location_service.dart';
import '../../../shared/customer_display.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/success_check.dart';
import '../../../shared/router/app_transitions.dart';

/// Logs that a salesman visited a customer. Customer is required and notes
/// are mandatory — a visit can't be marked done without saying what
/// happened (matches the backend's own validation in visits.routes.js).
/// The moment "Visit Done" is tapped the phone's location is captured and
/// sent along, and the server stamps the exact date/time (to the second) —
/// nothing extra for the salesman to do.
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

  // "Visit Done" opens a bottom sheet for the mandatory notes before the
  // final submit — matches the requested UX (notes captured at the
  // moment of marking the visit done, not buried in the main form).
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
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          left: 20, right: 20, top: 20,
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 20,
        ),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Visit Notes', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: AppColors.navy)),
          const SizedBox(height: 6),
          const Text('Required — what happened during this visit?',
              style: TextStyle(color: AppColors.steelBlue, fontSize: 12)),
          const SizedBox(height: 14),
          TextField(
            controller: notesController,
            maxLines: 4,
            autofocus: true,
            decoration: InputDecoration(
              hintText: 'e.g. Discussed new stock, customer wants a discount...',
              filled: true,
              fillColor: AppColors.warmGrey,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                if (notesController.text.trim().isEmpty) {
                  ScaffoldMessenger.of(sheetContext).showSnackBar(
                      const SnackBar(content: Text('Notes are required to mark this visit done.')));
                  return;
                }
                Navigator.of(sheetContext).pop(true);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.success, foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: const Text('Visit Done', style: TextStyle(fontWeight: FontWeight.bold)),
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
      // Captured now, at the moment of marking — see LocationService.
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
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: () => goBack(context, '/salesman-dashboard')),
        title: const Text('Record Customer Visit', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(14),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)]),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Date & time', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy)),
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              decoration: BoxDecoration(color: AppColors.warmGrey, borderRadius: BorderRadius.circular(10)),
              child: const Row(children: [
                Icon(Icons.schedule, size: 18, color: AppColors.steelBlue),
                SizedBox(width: 10),
                Expanded(
                  child: Text('Recorded automatically when you tap Visit Done',
                      style: TextStyle(color: AppColors.navy, fontWeight: FontWeight.w600, fontSize: 13)),
                ),
              ]),
            ),
            const SizedBox(height: 20),
            const Text('Customer', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy)),
            const SizedBox(height: 10),
            _loadingCustomers
                ? const Center(child: Padding(padding: EdgeInsets.all(8),
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.orange)))
                : DropdownButtonFormField<String>(
                    initialValue: _selectedCustomerId,
                    isExpanded: true,
                    decoration: InputDecoration(
                      filled: true, fillColor: AppColors.warmGrey,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      hintText: 'Select customer',
                    ),
                    items: _customers.map((c) => DropdownMenuItem(
                      value: c['id'] as String,
                      child: Text(customerTitle(c), overflow: TextOverflow.ellipsis),
                    )).toList(),
                    onChanged: (v) => setState(() => _selectedCustomerId = v),
                  ),
            const SizedBox(height: 28),
            RHRButton(text: 'Visit Done', onPressed: _onVisitDone, isLoading: _submitting),
          ]),
        ),
      ),
    );
  }
}
