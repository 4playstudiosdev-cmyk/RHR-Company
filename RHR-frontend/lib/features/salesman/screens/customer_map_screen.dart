import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';

class CustomerMapScreen extends StatefulWidget {
  const CustomerMapScreen({super.key});

  @override
  State<CustomerMapScreen> createState() => _CustomerMapScreenState();
}

class _CustomerMapScreenState extends State<CustomerMapScreen> {
  final _mapController = MapController();
  bool _isLoading = true;
  String? _error;
  List<Map<String, dynamic>> _customers = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      final response = await DioClient.instance.get(ApiEndpoints.customers);
      if (response.data['success'] == true) {
        setState(() => _customers = List<Map<String, dynamic>>.from(response.data['data'] ?? []));
      } else {
        setState(() => _error = response.data['message'] ?? 'Failed to load customers');
      }
    } catch (e) {
      setState(() => _error = 'Failed to load customers');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _withLocation => _customers
      .where((c) => c['shop_latitude'] != null && c['shop_longitude'] != null)
      .toList();

  void _showCustomerSheet(Map<String, dynamic> c) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const CircleAvatar(
              backgroundColor: AppColors.navy,
              child: Icon(Icons.business, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(c['full_name'] ?? 'Customer',
                    style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 16)),
                Text(c['phone'] ?? '', style: const TextStyle(color: AppColors.steelBlue, fontSize: 13)),
              ]),
            ),
          ]),
          if ((c['shop_name'] as String?)?.isNotEmpty == true) ...[
            const SizedBox(height: 14),
            Row(children: [
              const Icon(Icons.storefront_outlined, size: 16, color: AppColors.orange),
              const SizedBox(width: 8),
              Expanded(child: Text(c['shop_name'], style: const TextStyle(color: AppColors.navy, fontSize: 13))),
            ]),
          ],
          if ((c['shop_address'] as String?)?.isNotEmpty == true) ...[
            const SizedBox(height: 8),
            Row(children: [
              const Icon(Icons.location_on_outlined, size: 16, color: AppColors.steelBlue),
              const SizedBox(width: 8),
              Expanded(child: Text(c['shop_address'], style: const TextStyle(color: AppColors.steelBlue, fontSize: 13))),
            ]),
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () {
                Navigator.pop(context);
                context.go('/customer-detail', extra: c['id'] as String?);
              },
              style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AppColors.navy),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
              child: const Text('View Customer Profile', style: TextStyle(color: AppColors.navy, fontWeight: FontWeight.bold)),
            ),
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final located = _withLocation;
    final missing = _customers.length - located.length;

    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => context.go('/salesman-dashboard'),
        ),
        title: const Text('Customer Map', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _load),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: AppColors.steelBlue)))
              : located.isEmpty
                  ? const Center(child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('None of your customers have set a shop location yet.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppColors.steelBlue, fontSize: 14)),
                    ))
                  : Column(children: [
                      if (missing > 0)
                        Container(
                          width: double.infinity,
                          color: AppColors.orange.withValues(alpha: 0.12),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          child: Text('$missing customer(s) haven\'t set a shop location yet',
                              style: const TextStyle(color: AppColors.orange, fontSize: 12, fontWeight: FontWeight.w600)),
                        ),
                      Expanded(
                        child: FlutterMap(
                          mapController: _mapController,
                          options: MapOptions(
                            initialCenter: LatLng(
                              (located.first['shop_latitude'] as num).toDouble(),
                              (located.first['shop_longitude'] as num).toDouble(),
                            ),
                            initialZoom: 12,
                          ),
                          children: [
                            TileLayer(
                              urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                              subdomains: const ['a', 'b', 'c'],
                              userAgentPackageName: 'com.rhr.company.app',
                            ),
                            MarkerLayer(
                              markers: located.map((c) {
                                final pos = LatLng(
                                  (c['shop_latitude'] as num).toDouble(),
                                  (c['shop_longitude'] as num).toDouble(),
                                );
                                return Marker(
                                  point: pos,
                                  width: 40, height: 40,
                                  child: GestureDetector(
                                    onTap: () => _showCustomerSheet(c),
                                    child: const Icon(Icons.storefront, color: AppColors.orange, size: 32),
                                  ),
                                );
                              }).toList(),
                            ),
                          ],
                        ),
                      ),
                    ]),
    );
  }
}
