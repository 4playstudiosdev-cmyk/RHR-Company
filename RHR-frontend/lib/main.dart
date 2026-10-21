import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'core/constants/app_colors.dart';
import 'core/storage/hive_service.dart';
import 'core/storage/secure_storage.dart';
import 'services/gps_service.dart';
import 'services/push_service.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'core/features/app_features.dart';
import 'shared/router/app_router.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Edge-to-edge on every Android version (Android 15+ forces it): the app draws
  // behind the status / navigation bars and the screens keep their content clear
  // of them through Scaffold / SafeArea. Same look everywhere, no surprise on 15.
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    systemNavigationBarColor: Colors.transparent,
    systemNavigationBarContrastEnforced: false,
  ));
  // Lets the background GPS task and the UI talk to each other.
  FlutterForegroundTask.initCommunicationPort();
  await HiveService.init();
  await GPSService().initialize();
  await AppFeatures.restore();
  // Push notifications (Firebase). Never blocks or breaks startup if Firebase is unavailable.
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  await PushService.init();
  runApp(const ProviderScope(child: RHRApp()));
  unawaited(PushService.registerToken());
  // Deliberately NOT awaited before runApp: startTracking() can wait on the
  // Android location-permission dialog, which can't appear until the UI
  // exists. Awaiting it here left the phone stuck on the loading screen
  // forever whenever a salesman/driver session was already saved.
  unawaited(_resumeGpsIfFieldStaff());
}

/// If the app was killed and relaunched while a salesman/driver was still
/// logged in, resume GPS tracking automatically instead of waiting for a
/// fresh login.
Future<void> _resumeGpsIfFieldStaff() async {
  try {
    final token = await SecureStorage.getToken();
    final role = await SecureStorage.getRole();
    if (token != null && (role == 'salesman' || role == 'driver')) {
      await GPSService().startTracking();
    }
  } catch (_) {
    // Tracking is a background nicety; it must never break app startup.
  }
}

class RHRApp extends StatefulWidget {
  const RHRApp({super.key});

  @override
  State<RHRApp> createState() => _RHRAppState();
}

class _RHRAppState extends State<RHRApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Back to the foreground (screen turned on, switched back from another
  // app): make sure GPS tracking is really running and revive it if the
  // stream died while the app was in the background.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(GPSService().ensureTracking());
      unawaited(AppFeatures.load());
      unawaited(PushService.registerToken());
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'RHR & Company',
      debugShowCheckedModeBanner: false,
      routerConfig: appRouter,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primary),
        textTheme: GoogleFonts.interTextTheme(),
        useMaterial3: true,
      ),
    );
  }
}