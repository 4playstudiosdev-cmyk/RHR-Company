import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../../core/constants/app_colors.dart';
import '../../core/location/location_service.dart';

/// Full-screen Google Map picker for "Shop Location" on the Complete
/// Profile / Edit Profile screens. Opens centered on the device's current
/// GPS position (falls back to Karachi if permission is denied or the
/// fix times out), lets the user drag the map to fine-tune the pin, and
/// returns the chosen {latitude, longitude} via Navigator.pop when "Save
/// Location" is tapped — the caller is responsible for persisting it.
class ShopLocationPickerScreen extends StatefulWidget {
  final double? initialLatitude;
  final double? initialLongitude;
  const ShopLocationPickerScreen({super.key, this.initialLatitude, this.initialLongitude});

  @override
  State<ShopLocationPickerScreen> createState() => _ShopLocationPickerScreenState();
}

class _ShopLocationPickerScreenState extends State<ShopLocationPickerScreen> {
  static const _karachi = LatLng(24.8608, 67.0104);

  GoogleMapController? _mapController;
  LatLng _picked = _karachi;
  bool _locating = true;

  @override
  void initState() {
    super.initState();
    if (widget.initialLatitude != null && widget.initialLongitude != null) {
      _picked = LatLng(widget.initialLatitude!, widget.initialLongitude!);
      _locating = false;
    } else {
      _locateMe();
    }
  }

  Future<void> _locateMe() async {
    final pos = await LocationService.getCurrentPosition();
    if (!mounted) return;
    if (pos != null) {
      final here = LatLng(pos.latitude, pos.longitude);
      setState(() => _picked = here);
      _mapController?.animateCamera(CameraUpdate.newLatLngZoom(here, 17));
    }
    setState(() => _locating = false);
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
        GoogleMap(
          initialCameraPosition: CameraPosition(target: _picked, zoom: 16),
          onMapCreated: (c) => _mapController = c,
          onCameraMove: (pos) => _picked = pos.target,
          myLocationEnabled: true,
          myLocationButtonEnabled: false,
          zoomControlsEnabled: false,
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
