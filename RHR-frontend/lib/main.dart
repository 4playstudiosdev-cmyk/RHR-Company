import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'core/constants/app_colors.dart';
import 'core/storage/hive_service.dart';
import 'core/storage/secure_storage.dart';
import 'services/gps_service.dart';
import 'shared/router/app_router.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await HiveService.init();
  await GPSService().initialize();
  await _resumeGpsIfSalesman();
  runApp(const ProviderScope(child: RHRApp()));
}

/// If the app was killed and relaunched while a salesman was still logged
/// in, resume GPS tracking automatically instead of waiting for a fresh login.
Future<void> _resumeGpsIfSalesman() async {
  final token = await SecureStorage.getToken();
  final role = await SecureStorage.getRole();
  if (token != null && role == 'salesman') {
    await GPSService().startTracking();
  }
}

class RHRApp extends StatelessWidget {
  const RHRApp({super.key});

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