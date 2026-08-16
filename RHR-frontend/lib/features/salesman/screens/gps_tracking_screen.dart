import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../services/gps_service.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/widgets/staggered_fade_in.dart';

class GpsTrackingScreen extends StatefulWidget {
  const GpsTrackingScreen({super.key});

  @override
  State<GpsTrackingScreen> createState() => _GpsTrackingScreenState();
}

class _GpsTrackingScreenState extends State<GpsTrackingScreen> {
  final _service = GPSService();
  bool _isBusy = false;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    // GPS tracking is a shared singleton (started at login, stopped at
    // logout) — this screen just reflects and lets you toggle its state.
    _refreshTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _toggle() async {
    setState(() => _isBusy = true);
    try {
      if (_service.isTracking) {
        await _service.stopTracking();
      } else {
        final started = await _service.startTracking();
        if (!started && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Location permission denied — cannot track GPS.')));
        }
      }
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isTracking = _service.isTracking;
    final pending = _service.pendingOfflineCount;
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => context.go('/salesman-dashboard')),
        title: const Text('GPS Tracking',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: Padding(padding: const EdgeInsets.all(20), child: Column(children: [
        AnimatedContainer(duration: const Duration(milliseconds: 350), curve: Curves.easeOut,
            width: double.infinity, padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
                color: isTracking ? AppColors.navy : AppColors.white,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 12)]),
            child: Column(children: [
              AnimatedScale(
                scale: isTracking ? 1.1 : 1.0,
                duration: const Duration(milliseconds: 350),
                curve: Curves.easeOutBack,
                child: Icon(isTracking ? Icons.location_on : Icons.location_off,
                    size: 64, color: isTracking ? AppColors.orange : AppColors.disabled),
              ),
              const SizedBox(height: 16),
              Text(isTracking ? 'GPS Active' : 'GPS Inactive',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold,
                      color: isTracking ? Colors.white : AppColors.navy)),
              const SizedBox(height: 8),
              Text(isTracking ? 'Pinging every 2 minutes' : 'Not tracking',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: isTracking ? Colors.white60 : AppColors.steelBlue, fontSize: 13)),
            ])),
        const SizedBox(height: 24),
        Row(children: [
          Expanded(child: StaggeredFadeIn(index: 0, child: _box(
              pending > 0 ? Icons.cloud_off_outlined : Icons.cloud_done_outlined,
              'Pending Sync', '$pending'))),
          const SizedBox(width: 12),
          Expanded(child: StaggeredFadeIn(index: 1, child: _box(Icons.timer_outlined, 'Interval', '2 min'))),
        ]),
        const SizedBox(height: 24),
        if (pending > 0) Container(padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
                color: AppColors.orange.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.orange)),
            child: Row(children: [
              const Icon(Icons.info_outline, color: AppColors.orange),
              const SizedBox(width: 12),
              Expanded(child: Text('$pending location point(s) queued offline — will sync automatically once you\'re back online.',
                  style: const TextStyle(color: AppColors.navy, fontSize: 13))),
            ]))
        else if (!isTracking) Container(padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
                color: AppColors.orange.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.orange)),
            child: const Row(children: [
              Icon(Icons.info_outline, color: AppColors.orange),
              SizedBox(width: 12),
              Expanded(child: Text('Admin will see your live location when tracking is ON.',
                  style: TextStyle(color: AppColors.navy, fontSize: 13))),
            ])),
        const Spacer(),
        RHRButton(text: isTracking ? 'Stop GPS Tracking' : 'Start GPS Tracking',
            onPressed: _toggle, isLoading: _isBusy, isSecondary: isTracking),
      ])),
    );
  }

  Widget _box(IconData icon, String label, String value) =>
      Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(12),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 6)]),
          child: Column(children: [
            Icon(icon, color: AppColors.orange, size: 22),
            const SizedBox(height: 6),
            Text(value, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 14)),
            Text(label, style: const TextStyle(color: AppColors.steelBlue, fontSize: 10)),
          ]));
}
