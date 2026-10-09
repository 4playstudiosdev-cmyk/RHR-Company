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
