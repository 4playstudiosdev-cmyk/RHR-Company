import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'core/constants/app_colors.dart';
import 'core/storage/hive_service.dart';
import 'core/storage/connectivity_service.dart';
import 'core/storage/secure_storage.dart';
import 'services/gps_service.dart';
import 'services/push_service.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'core/features/app_features.dart';
import 'core/network/api_cache.dart';
import 'core/network/offline_prefetch.dart';
import 'core/storage/sync_service.dart';
import 'shared/router/app_router.dart';
import 'shared/widgets/offline_banner.dart';

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
  final sw = Stopwatch()..start();
  await HiveService.init();
  ConnectivityService.startListening();
  // Independent local setup — done together.
  await Future.wait([GPSService().initialize(), AppFeatures.restore(), ApiCache.init()]);
  SyncService.start();
  debugPrint('STARTUP: local storage ready in ${sw.elapsedMilliseconds} ms');
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  runApp(const ProviderScope(child: RHRApp()));
  debugPrint('STARTUP: first screen at ${sw.elapsedMilliseconds} ms');
  // Push notifications (Firebase) are set up after the first screen is shown —
  // they don't need to hold the app on the splash. Never breaks startup.
  unawaited(PushService.init().then((_) {
    debugPrint('STARTUP: push ready at ${sw.elapsedMilliseconds} ms');
    return PushService.registerToken();
  }));
  // Deliberately NOT awaited before runApp: startTracking() can wait on the
  // Android location-permission dialog, which can't appear until the UI
  // exists. Awaiting it here left the phone stuck on the loading screen
  // forever whenever a salesman/driver session was already saved.
  unawaited(_resumeGpsIfFieldStaff());
  // Offline mode: send anything saved offline, then save every screen's data
  // on the phone for the next time the internet drops.
  unawaited(_syncAndPrefetch());
}

Future<void> _syncAndPrefetch() async {
  try {
    if (!await SecureStorage.isLoggedIn()) return;
    await SyncService.syncAll();
    await OfflinePrefetch.run();
  } catch (_) {/* best effort */}
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
      unawaited(_syncAndPrefetch());
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'RHR & Company',
      debugShowCheckedModeBanner: false,
      routerConfig: appRouter,
      // Offline / waiting-to-sync bar above every screen.
      builder: (context, child) => OfflineBanner(child: child ?? const SizedBox.shrink()),
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primary),
        textTheme: GoogleFonts.interTextTheme(),
        useMaterial3: true,
      ),
    );
  }
}