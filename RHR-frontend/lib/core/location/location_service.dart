import 'package:geolocator/geolocator.dart';
import 'package:location/location.dart' as loc;

class LocationService {
  /// When device GPS is off, Geolocator has no way to prompt the user —
  /// it can only report "disabled" and fail silently. The `location`
  /// package's requestService() goes through Google Play Services'
  /// Settings Resolution API, which shows the native "Turn on Location?"
  /// dialog in-app (the dark system popup apps like Uber use) instead of
  /// just failing or navigating away to the Settings app. Returns true
  /// once the service is confirmed on (already was, or user just turned
  /// it on), false if the user declined or it's still off.
  static Future<bool> ensureLocationServiceOn() async {
    final location = loc.Location();
    try {
      var serviceEnabled = await location.serviceEnabled();
      if (!serviceEnabled) {
        serviceEnabled = await location.requestService();
      }
      return serviceEnabled;
    } catch (_) {
      return false;
    }
  }

  /// Requests location permission (if needed) and returns the current
  /// device position, or null if permission was denied / location
  /// services are off.
  static Future<Position?> getCurrentPosition() async {
    try {
      if (!await ensureLocationServiceOn()) return null;

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return null;
      }

      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
    } catch (_) {
      return null;
    }
  }
}
