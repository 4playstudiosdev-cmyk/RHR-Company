import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/constants/app_colors.dart';
import '../../core/location/location_service.dart';
import '../../core/network/dio_client.dart';

/// Full-screen OpenStreetMap picker for "Shop Location" on the Complete
/// Profile / Edit Profile screens — no API key, no billing dependency
/// (same reasoning as customer_map_screen.dart's choice of flutter_map).
/// Always opens centered on the device's CURRENT GPS position (never the
/// previously-saved pin — a stale saved location showing up instead of
/// where the user actually is was confusing), falling back to Karachi
/// only if permission is denied or the fix times out. Lets the user drag
/// the map to fine-tune the pin, or type an address into the search bar,
/// and returns the chosen {latitude, longitude} via Navigator.pop when
/// "Save Location" is tapped — the caller persists it.
class ShopLocationPickerScreen extends StatefulWidget {
  final double? initialLatitude;
  final double? initialLongitude;
  const ShopLocationPickerScreen({super.key, this.initialLatitude, this.initialLongitude});

  @override
  State<ShopLocationPickerScreen> createState() => _ShopLocationPickerScreenState();
}

class _ShopLocationPickerScreenState extends State<ShopLocationPickerScreen> {
  static const _karachi = LatLng(24.8608, 67.0104);

  final _mapController = MapController();
  final _searchController = TextEditingController();
  LatLng _picked = _karachi;
  bool _locating = true;
  bool _searching = false;
  List<Map<String, dynamic>> _searchResults = [];

  @override
  void initState() {
    super.initState();
    if (widget.initialLatitude != null && widget.initialLongitude != null) {
      // Pre-seeds the pin so there's something sensible on screen the
      // instant it opens, but _locateMe below still runs and overrides
      // it with the real current position once the GPS fix comes back.
      _picked = LatLng(widget.initialLatitude!, widget.initialLongitude!);
    }
    _locateMe();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _locateMe() async {
    setState(() => _locating = true);
    final pos = await LocationService.getCurrentPosition();
    if (!mounted) return;
    if (pos != null) {
      final here = LatLng(pos.latitude, pos.longitude);
      setState(() => _picked = here);
      _mapController.move(here, 17);
    }
    setState(() => _locating = false);
  }

  Future<void> _search(String query) async {
    if (query.trim().length < 3) return;
    setState(() => _searching = true);
    try {
      final res = await DioClient.instance.get(ApiEndpoints.geocodeSearch, queryParameters: {'q': query.trim()});
      if (res.data['success'] == true && mounted) {
        setState(() => _searchResults = List<Map<String, dynamic>>.from(res.data['data'] ?? []));
      }
    } catch (e) {
      // best-effort — search is a convenience, not required to set a location
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _selectSearchResult(Map<String, dynamic> result) {
    final here = LatLng((result['latitude'] as num).toDouble(), (result['longitude'] as num).toDouble());
    setState(() {
      _picked = here;
      _searchResults = [];
      _searchController.text = result['display_name'] as String? ?? '';
    });
    _mapController.move(here, 17);
    FocusScope.of(context).unfocus();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: const Text('Shop Location'),
      ),
      body: Stack(children: [
        FlutterMap(
          mapController: _mapController,
          options: MapOptions(
            initialCenter: _picked,
            initialZoom: 16,
            onPositionChanged: (camera, hasGesture) => _picked = camera.center,
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
              subdomains: const ['a', 'b', 'c'],
              userAgentPackageName: 'com.rhr.company.app',
            ),
          ],
        ),
        // Fixed center pin — the map moves under it, so wherever it points
        // when the user stops dragging IS the picked coordinate.
        const IgnorePointer(
          child: Center(
            child: Padding(
              padding: EdgeInsets.only(bottom: 36),
              child: Icon(Icons.location_on, size: 48, color: AppColors.primary),
            ),
          ),
        ),
        if (_locating)
          Container(
            color: Colors.black.withValues(alpha: 0.15),
            child: const Center(child: CircularProgressIndicator(color: AppColors.primary)),
          ),
        // Search bar + results dropdown
        Positioned(
          left: 12, right: 12, top: 12,
          child: Column(children: [
            Material(
              elevation: 3,
              borderRadius: BorderRadius.circular(12),
              child: TextField(
                controller: _searchController,
                onSubmitted: _search,
                decoration: InputDecoration(
                  hintText: 'Search for an address...',
                  prefixIcon: const Icon(Icons.search, color: AppColors.primary),
                  suffixIcon: _searching
                      ? const Padding(
                          padding: EdgeInsets.all(12),
                          child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                        )
                      : IconButton(icon: const Icon(Icons.send), onPressed: () => _search(_searchController.text)),
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                  contentPadding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
            if (_searchResults.isNotEmpty)
              Container(
                margin: const EdgeInsets.only(top: 6),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 8)]),
                constraints: const BoxConstraints(maxHeight: 220),
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: _searchResults.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final r = _searchResults[i];
                    return ListTile(
                      dense: true,
                      leading: const Icon(Icons.place_outlined, color: AppColors.primary),
                      title: Text(r['display_name'] ?? '', maxLines: 2, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13)),
                      onTap: () => _selectSearchResult(r),
                    );
                  },
                ),
              ),
          ]),
        ),
        Positioned(
          right: 16, bottom: 110,
          child: FloatingActionButton(
            heroTag: 'locate-me',
            backgroundColor: Colors.white,
            onPressed: _locateMe,
            child: const Icon(Icons.my_location, color: AppColors.primary),
          ),
        ),
        Positioned(
          left: 16, right: 16, bottom: 24,
          child: SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => Navigator.of(context).pop({
                'latitude':  _picked.latitude,
                'longitude': _picked.longitude,
              }),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: const Icon(Icons.check),
              label: const Text('Save Location', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ),
        ),
      ]),
    );
  }
}
