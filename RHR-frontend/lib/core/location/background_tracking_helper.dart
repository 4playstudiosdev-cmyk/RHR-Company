import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../constants/app_colors.dart';
import '../storage/secure_storage.dart';

/// Gets a salesman's / driver's phone ready to keep sending GPS with the
/// screen off:
///  * asks for the Android 13+ notification permission (the tracking
///    notification can't show without it);
///  * if the app is still subject to battery optimisation, explains why that
///    stops tracking and opens the system screen where it's switched off.
/// Many phones (TECNO, Xiaomi, Oppo, Vivo...) kill background location for
/// apps that aren't exempted — the app can't override that itself, only ask.
class BackgroundTrackingHelper {
  static const _channel = MethodChannel('rhr/power');
  static const _boxName = 'gps_settings';
  static const _askedKey = 'battery_prompt_at';
  static const _askAgainAfter = Duration(days: 3);

  static Future<bool> isExempt() async {
    if (!Platform.isAndroid) return true;
    try {
      return (await _channel.invokeMethod<bool>('isIgnoringBatteryOptimizations')) ?? false;
    } catch (_) {
      return true; // can't tell — don't nag
    }
  }

  static Future<void> openBatterySettings() async {
    try {
      await _channel.invokeMethod('openBatterySettings');
    } catch (_) {}
  }

  static Future<void> _requestNotificationPermission() async {
    try {
      await _channel.invokeMethod('requestNotificationPermission');
    } catch (_) {}
  }

  /// Call once the dashboard is on screen. Shows the explanation at most
  /// every few days, and only while the app is still battery-restricted.
  static Future<void> promptIfNeeded(BuildContext context) async {
    try {
      if (!Platform.isAndroid) return;
      final role = await SecureStorage.getRole();
      if (role != 'salesman' && role != 'driver' && role != 'delivery') return;

      await _requestNotificationPermission();
      if (await isExempt()) return;

      final box = await Hive.openBox(_boxName);
      final last = DateTime.tryParse(box.get(_askedKey)?.toString() ?? '');
      if (last != null && DateTime.now().difference(last) < _askAgainAfter) return;
      await box.put(_askedKey, DateTime.now().toIso8601String());
      if (!context.mounted) return;

      final open = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Text('Keep location working',
              style: TextStyle(color: AppColors.navy, fontWeight: FontWeight.bold, fontSize: 18)),
          content: const SingleChildScrollView(
            child: Text(
              'To keep sharing your location while the phone screen is off or you are in '
              'another app, please let RHR Company run in the background:\n\n'
              '1. Tap "Open Settings"\n'
              '2. Choose RHR Company and set it to "Don\'t optimize" / "Unrestricted" '
              '(and allow Auto-start if your phone has that option).',
              style: TextStyle(fontSize: 13, height: 1.4),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Later', style: TextStyle(color: Color(0xFF6B7280))),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.orange, foregroundColor: Colors.white),
              child: const Text('Open Settings'),
            ),
          ],
        ),
      );
      if (open == true) await openBatterySettings();
    } catch (_) {
      // a nicety — never an app error
    }
  }
}
