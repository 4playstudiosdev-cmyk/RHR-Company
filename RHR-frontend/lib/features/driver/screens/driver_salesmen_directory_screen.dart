import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/router/app_transitions.dart';

/// Directory of every salesman at this driver's branch — name, phone,
/// tap to call. Lets a driver reach the right salesman directly instead
/// of only seeing one customer's assigned salesman on an order at a time.
class DriverSalesmenDirectoryScreen extends StatefulWidget {
  const DriverSalesmenDirectoryScreen({super.key});

  @override
  State<DriverSalesmenDirectoryScreen> createState() => _DriverSalesmenDirectoryScreenState();
}

class _DriverSalesmenDirectoryScreenState extends State<DriverSalesmenDirectoryScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _salesmen = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await DioClient.instance.get(ApiEndpoints.salesmenDirectory);
      if (res.data['success'] == true) {
        setState(() => _salesmen = List<Map<String, dynamic>>.from(res.data['data'] ?? []));
      }
    } catch (e) {
      debugPrint('Salesmen directory load error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _call(String? phone) async {
    if (phone == null || phone.isEmpty) return;
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: () => goBack(context, '/driver-dashboard')),
        title: const Text('All Salesmen', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : _salesmen.isEmpty
              ? const Center(child: Text('No salesmen found.', style: TextStyle(color: AppColors.steelBlue)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _salesmen.length,
                    itemBuilder: (context, i) {
                      final s = _salesmen[i];
                      return Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(14),
                            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)]),
                        child: Row(children: [
                          const CircleAvatar(backgroundColor: AppColors.navy, child: Icon(Icons.badge_outlined, color: Colors.white, size: 18)),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(s['full_name'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 14)),
                              Text(s['phone'] ?? '', style: const TextStyle(color: AppColors.steelBlue, fontSize: 12)),
                              if ((s['position'] as String?)?.isNotEmpty == true)
                                Text(s['position'], style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
                            ]),
                          ),
                          IconButton(
                            onPressed: () => _call(s['phone'] as String?),
                            icon: const Icon(Icons.call, color: AppColors.success),
                          ),
                        ]),
                      );
                    },
                  ),
                ),
    );
  }
}
