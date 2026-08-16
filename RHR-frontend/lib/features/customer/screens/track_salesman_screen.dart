import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/rhr_button.dart';

const _kKarachi = LatLng(24.8608, 67.0104);
const _kRefreshInterval = Duration(seconds: 20);

class TrackSalesmanScreen extends StatefulWidget {
  const TrackSalesmanScreen({super.key});

  @override
  State<TrackSalesmanScreen> createState() => _TrackSalesmanScreenState();
}

class _TrackSalesmanScreenState extends State<TrackSalesmanScreen> {
  final _mapController = MapController();
  Timer? _timer;

  bool _isLoading = true;
  String? _error;
  bool _assigned = false;
  String? _salesmanName;
  String? _salesmanPhone;
  LatLng? _salesmanPos;
  String? _lastSeenIso;
  LatLng? _shopPos;
  double? _distanceKm;
  int? _etaMinutes;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(_kRefreshInterval, (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _isLoading = true);
    try {
      final response = await DioClient.instance.get('/api/v1/gps/my-salesman');
      if (response.data['success'] == true) {
        final data = response.data['data'] as Map<String, dynamic>;
        final assigned = data['assigned'] == true;
        LatLng? salesmanPos;
        LatLng? shopPos;
        final loc = data['location'] as Map<String, dynamic>?;
        if (loc != null) {
          salesmanPos = LatLng((loc['latitude'] as num).toDouble(), (loc['longitude'] as num).toDouble());
        }
        final shop = data['shopLocation'] as Map<String, dynamic>?;
        if (shop != null) {
          shopPos = LatLng((shop['latitude'] as num).toDouble(), (shop['longitude'] as num).toDouble());
        }

        setState(() {
          _assigned = assigned;
          _salesmanName = data['salesman']?['full_name'] as String?;
          _salesmanPhone = data['salesman']?['phone'] as String?;
          _salesmanPos = salesmanPos;
          _lastSeenIso = loc?['recorded_at'] as String?;
          _shopPos = shopPos;
          _distanceKm = (data['distanceKm'] as num?)?.toDouble();
          _etaMinutes = data['etaMinutes'] as int?;
          _error = null;
        });

        if (salesmanPos != null && !silent) {
          _mapController.move(salesmanPos, 14);
        }
      } else if (!silent) {
        setState(() => _error = response.data['message'] ?? 'Failed to load salesman location');
      }
    } catch (e) {
      if (!silent) setState(() => _error = 'Failed to load salesman location');
    } finally {
      if (mounted && !silent) setState(() => _isLoading = false);
    }
  }

  String _timeAgo(String? iso) {
    if (iso == null) return '';
    final d = DateTime.tryParse(iso);
    if (d == null) return '';
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
    return '${diff.inHours} hr ago';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => context.go('/profile'),
        ),
        title: const Text('Track My Salesman',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : _error != null
              ? Center(child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(_error!, textAlign: TextAlign.center,
                        style: const TextStyle(color: AppColors.steelBlue)),
                    const SizedBox(height: 16),
                    RHRButton(text: 'Retry', onPressed: () => _load()),
                  ]),
                ))
              : !_assigned
                  ? const Center(child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('No salesman assigned to your account yet.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppColors.steelBlue, fontSize: 14)),
                    ))
                  : Column(children: [
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(20),
                        color: AppColors.navy,
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            const CircleAvatar(
                              backgroundColor: AppColors.orange,
                              child: Icon(Icons.handshake_outlined, color: Colors.white, size: 20),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(_salesmanName ?? 'Your Salesman',
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                                if (_salesmanPhone != null)
                                  Text(_salesmanPhone!, style: const TextStyle(color: Colors.white60, fontSize: 12)),
                              ]),
                            ),
                          ]),
                          const SizedBox(height: 16),
                          if (_salesmanPos == null)
                            const Text('Waiting for location update from your salesman...',
                                style: TextStyle(color: Colors.white70, fontSize: 12))
                          else
                            Row(children: [
                              Expanded(child: _statBox(
                                  _distanceKm != null ? '${_distanceKm!.toStringAsFixed(1)} km' : '—',
                                  'Distance')),
                              const SizedBox(width: 12),
                              Expanded(child: _statBox(
                                  _etaMinutes != null ? '~$_etaMinutes min' : '—',
                                  'Estimated arrival')),
                              const SizedBox(width: 12),
                              Expanded(child: _statBox(_timeAgo(_lastSeenIso), 'Last seen')),
                            ]),
                          if (_salesmanPos != null && _shopPos == null) ...[
                            const SizedBox(height: 10),
                            const Text(
                                "Set your shop location in Profile to see distance & ETA.",
                                style: TextStyle(color: AppColors.orange, fontSize: 11)),
                          ],
                        ]),
                      ),
                      Expanded(
                        child: FlutterMap(
                          mapController: _mapController,
                          options: MapOptions(
                            initialCenter: _salesmanPos ?? _shopPos ?? _kKarachi,
                            initialZoom: 13,
                          ),
                          children: [
                            TileLayer(
                              urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                              subdomains: const ['a', 'b', 'c'],
                              userAgentPackageName: 'com.rhr.company.app',
                            ),
                            MarkerLayer(markers: [
                              if (_shopPos != null)
                                Marker(
                                  point: _shopPos!,
                                  width: 40, height: 40,
                                  child: const Icon(Icons.storefront, color: AppColors.orange, size: 34),
                                ),
                              if (_salesmanPos != null)
                                Marker(
                                  point: _salesmanPos!,
                                  width: 40, height: 40,
                                  child: const Icon(Icons.local_shipping, color: AppColors.navy, size: 34),
                                ),
                            ]),
                          ],
                        ),
                      ),
                    ]),
    );
  }

  Widget _statBox(String value, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(children: [
        Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(color: Colors.white60, fontSize: 10), textAlign: TextAlign.center),
      ]),
    );
  }
}
