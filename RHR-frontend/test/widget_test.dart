// Basic smoke test for the RHR & Company app.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:rhr_app/main.dart';

void main() {
  testWidgets('App starts on the login screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: RHRApp()));

    // The app's initial route is '/login' (see app_router.dart) — verify
    // the login screen actually renders instead of crashing on startup.
    expect(find.text('RHR & Company'), findsOneWidget);
    expect(find.text('Welcome Back'), findsOneWidget);
    expect(find.text('Send OTP'), findsOneWidget);
  });
}
