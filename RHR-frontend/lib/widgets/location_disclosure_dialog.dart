import 'package:flutter/material.dart';

/// Google Play policy requires a prominent, in-app disclosure of
/// background location use BEFORE the OS permission prompt is ever
/// triggered (not just an OS dialog) — shown once per consent (see
/// SecureStorage.getLocationConsent/saveLocationConsent), re-requested
/// after a logout since that clears all stored state.
///
/// Returns true if the user tapped "I Understand & Allow", false if they
/// declined or dismissed the dialog any other way.
Future<bool> showLocationDisclosureDialog(BuildContext context) async {
  const darkNavy = Color(0xFF1B2E6B);
  const orange = Color(0xFFE8841A);

  final accepted = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) => AlertDialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: const Text(
        'Location Access Required',
        style: TextStyle(color: darkNavy, fontWeight: FontWeight.bold, fontSize: 18),
      ),
      content: const SingleChildScrollView(
        child: Text(
          'RHR & Company collects your location data to enable '
          'salesman tracking even when the app is running in the '
          'background. This data is used to:\n\n'
          '• Track your field visits and customer locations\n'
          '• Monitor delivery routes and arrival times\n'
          '• Record departure and return times for attendance\n\n'
          'Location tracking is active only during work hours '
          'while you are logged in, and stops when you log out.\n\n'
          'Your location data is shared with RHR & Company '
          'management only and is not shared with third parties.',
          style: TextStyle(color: Color(0xFF374151), fontSize: 14, height: 1.5),
        ),
      ),
      actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: const Text('Decline', style: TextStyle(color: Color(0xFF6B7280))),
        ),
        ElevatedButton(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          style: ElevatedButton.styleFrom(
            backgroundColor: orange,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
          child: const Text('I Understand & Allow'),
        ),
      ],
    ),
  );

  return accepted ?? false;
}

/// Shown once, right after the splash screen, before the user even
/// reaches the login screen — covers every role (customer, salesman,
/// driver) in one dialog since the role isn't known yet at this point.
/// Accepting sets BOTH consent flags (see SecureStorage) so the later
/// role-specific prompts below are skipped; declining leaves both
/// unset, so declining here still lets a user log in and use the app —
/// they'll just be asked again the first time they actually try to use
/// a location-dependent feature (see GPSService/profile_screen.dart).
Future<bool> showAppLaunchLocationDisclosureDialog(BuildContext context) async {
  const darkNavy = Color(0xFF1B2E6B);
  const orange = Color(0xFFE8841A);

  final accepted = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) => AlertDialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: const Text(
        'Location Access',
        style: TextStyle(color: darkNavy, fontWeight: FontWeight.bold, fontSize: 18),
      ),
      content: const SingleChildScrollView(
        child: Text(
          'RHR & Company uses your location to:\n\n'
          '• Let customers pin their shop\'s location for deliveries\n'
          '• Track salesman and driver field visits during work hours\n'
          '• Monitor delivery routes and arrival/departure times\n\n'
          'For salesmen and drivers, location is collected even when '
          'the app is running in the background during an active work '
          'session, and stops automatically when you log out. For '
          'customers, location is only read once when you choose to '
          'set your shop\'s location.\n\n'
          'Your location data is shared with RHR & Company '
          'management only and is not shared with third parties.',
          style: TextStyle(color: Color(0xFF374151), fontSize: 14, height: 1.5),
        ),
      ),
      actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: const Text('Decline', style: TextStyle(color: Color(0xFF6B7280))),
        ),
        ElevatedButton(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          style: ElevatedButton.styleFrom(
            backgroundColor: orange,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
          child: const Text('I Understand & Allow'),
        ),
      ],
    ),
  );

  return accepted ?? false;
}

/// Same Google Play requirement, different use case: a customer setting
/// their shop's location (profile_screen.dart) is a one-time foreground
/// GPS read, not background tracking — the copy below reflects that
/// instead of reusing the salesman-tracking wording above, which would
/// be misleading ("even when in the background") for this flow.
///
/// Returns true if the user tapped "Allow", false otherwise.
Future<bool> showShopLocationDisclosureDialog(BuildContext context) async {
  const darkNavy = Color(0xFF1B2E6B);
  const orange = Color(0xFFE8841A);

  final accepted = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) => AlertDialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: const Text(
        'Location Access Required',
        style: TextStyle(color: darkNavy, fontWeight: FontWeight.bold, fontSize: 18),
      ),
      content: const SingleChildScrollView(
        child: Text(
          'RHR & Company would like to use your current location to '
          'set your shop\'s location on the map. This is used to:\n\n'
          '• Pin your shop\'s exact location for deliveries\n'
          '• Help salesmen and drivers find your shop\n\n'
          'Your location is read once, only when you tap "Set Shop '
          'Location" — the app does not track your location in the '
          'background for this feature.\n\n'
          'Your location data is shared with RHR & Company '
          'management only and is not shared with third parties.',
          style: TextStyle(color: Color(0xFF374151), fontSize: 14, height: 1.5),
        ),
      ),
      actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: const Text('Decline', style: TextStyle(color: Color(0xFF6B7280))),
        ),
        ElevatedButton(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          style: ElevatedButton.styleFrom(
            backgroundColor: orange,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
          child: const Text('Allow'),
        ),
      ],
    ),
  );

  return accepted ?? false;
}
