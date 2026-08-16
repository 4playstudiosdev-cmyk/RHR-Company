import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../core/location/location_service.dart';
import '../../../shared/widgets/staggered_fade_in.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  bool _isIn = false;
  String? _inTime, _outTime;
  bool _isLoading = true;
  bool _isSubmitting = false;

  final _now = DateTime.now();
  Map<int, String> _cal = {}; // day -> status ('present'/'absent'/'late')
  int _present = 0, _absent = 0, _late = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _isLoading = true);
    try {
      final userId = await SecureStorage.getUserId();
      final response = await DioClient.instance.get(
        '/api/v1/hrm/attendance/$userId',
        queryParameters: {'month': _now.month, 'year': _now.year},
      );
      if (response.data['success'] == true) {
        final data = response.data['data'] as Map<String, dynamic>? ?? {};
        final records = List<Map<String, dynamic>>.from(data['records'] ?? []);
        final summary = Map<String, dynamic>.from(data['summary'] ?? {});
        final cal = <int, String>{};
        final todayStr = _now.toIso8601String().split('T')[0];
        for (final r in records) {
          final dateStr = (r['date'] ?? '').toString();
          final day = int.tryParse(dateStr.split('-').last);
          if (day == null) continue;
          cal[day] = (r['is_late'] == true) ? 'late' : (r['status'] ?? 'present');
          if (dateStr == todayStr) {
            _isIn = r['check_in'] != null && r['check_out'] == null;
            _inTime = _fmtTime(r['check_in']);
            _outTime = _fmtTime(r['check_out']);
          }
        }
        setState(() {
          _cal = cal;
          _present = (summary['presentDays'] ?? 0) as int;
          _absent = (summary['absentDays'] ?? 0) as int;
          _late = (summary['lateDays'] ?? 0) as int;
        });
      }
    } catch (e) {
      debugPrint('Attendance load error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  String? _fmtTime(dynamic iso) {
    if (iso == null) return null;
    final d = DateTime.tryParse(iso.toString());
    if (d == null) return null;
    final local = d.toLocal();
    final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final period = local.hour >= 12 ? 'PM' : 'AM';
    return '$hour:${local.minute.toString().padLeft(2, '0')} $period';
  }

  Color _dc(String s) {
    if (s == 'present') return AppColors.success;
    if (s == 'absent') return AppColors.error;
    return AppColors.orange;
  }

  Future<void> _toggle() async {
    setState(() => _isSubmitting = true);
    try {
      final pos = await LocationService.getCurrentPosition();
      final body = pos != null
          ? {'latitude': pos.latitude, 'longitude': pos.longitude}
          : <String, dynamic>{};
      final endpoint = _isIn
          ? '/api/v1/hrm/attendance/checkout'
          : '/api/v1/hrm/attendance/checkin';
      final response = await DioClient.instance.post(endpoint, data: body);
      if (response.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(response.data['message'] ?? (_isIn ? 'Checked out!' : 'Checked in!')),
              backgroundColor: _isIn ? AppColors.navy : AppColors.success));
        }
        await _load();
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(response.data['message'] ?? 'Action failed')));
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  static const _monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

  @override
  Widget build(BuildContext context) {
    final daysInMonth = DateTime(_now.year, _now.month + 1, 0).day;
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
          backgroundColor: AppColors.navy,
          leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white),
              onPressed: () => context.go('/salesman-dashboard')),
          title: const Text('Attendance',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold))),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : SingleChildScrollView(padding: const EdgeInsets.all(16), child: Column(children: [
        // Check-in Card
        AnimatedContainer(duration: const Duration(milliseconds: 350), curve: Curves.easeOut,
            width: double.infinity, padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
                color: _isIn ? AppColors.success : AppColors.navy,
                borderRadius: BorderRadius.circular(20)),
            child: Column(children: [
              AnimatedScale(
                scale: _isIn ? 1.1 : 1.0,
                duration: const Duration(milliseconds: 350),
                curve: Curves.easeOutBack,
                child: Icon(_isIn ? Icons.check_circle : Icons.access_time,
                    size: 56, color: Colors.white),
              ),
              const SizedBox(height: 12),
              Text(_isIn ? 'You are Checked In' : 'Not Checked In',
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              if (_inTime != null) ...[const SizedBox(height: 8),
                Text('Check-in: $_inTime', style: const TextStyle(color: Colors.white70))],
              if (_outTime != null)
                Text('Check-out: $_outTime', style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 20),
              SizedBox(width: double.infinity,
                  child: ElevatedButton(
                      onPressed: (_isSubmitting || (_isIn && _outTime != null)) ? null : _toggle,
                      style: ElevatedButton.styleFrom(
                          backgroundColor: _isIn ? Colors.white : AppColors.orange,
                          foregroundColor: _isIn ? AppColors.success : Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                      child: _isSubmitting
                          ? const SizedBox(height: 20, width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text(_isIn ? 'Check Out' : 'Check In',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)))),
            ])),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: StaggeredFadeIn(index: 0, child: _s('Present', '$_present', AppColors.success))), const SizedBox(width: 10),
          Expanded(child: StaggeredFadeIn(index: 1, child: _s('Absent', '$_absent', AppColors.error))), const SizedBox(width: 10),
          Expanded(child: StaggeredFadeIn(index: 2, child: _s('Late', '$_late', AppColors.orange))),
        ]),
        const SizedBox(height: 16),
        Container(padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.white, borderRadius: BorderRadius.circular(16)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${_monthNames[_now.month]} ${_now.year}', style: const TextStyle(
                  fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 16)),
              const SizedBox(height: 12),
              GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 7, mainAxisSpacing: 6, crossAxisSpacing: 6, childAspectRatio: 1),
                  itemCount: daysInMonth,
                  itemBuilder: (_, i) {
                    final d = i + 1;
                    final s = _cal[d];
                    return StaggeredFadeIn(index: i, scale: true, baseDelay: const Duration(milliseconds: 15),
                        child: Container(
                        decoration: BoxDecoration(
                            color: s != null ? _dc(s).withValues(alpha: 0.15) : AppColors.warmGrey,
                            borderRadius: BorderRadius.circular(6),
                            border: s != null ? Border.all(color: _dc(s), width: 1.5) : null),
                        child: Center(child: Text('$d', style: TextStyle(
                            fontSize: 11,
                            color: s != null ? _dc(s) : AppColors.disabled,
                            fontWeight: s != null ? FontWeight.bold : FontWeight.normal)))));
                  }),
              const SizedBox(height: 12),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                _leg(AppColors.success, 'Present'), const SizedBox(width: 16),
                _leg(AppColors.error, 'Absent'), const SizedBox(width: 16),
                _leg(AppColors.orange, 'Late'),
              ]),
            ])),
      ])),
    );
  }

  Widget _s(String l, String v, Color c) => Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
          color: c.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12),
          border: Border.all(color: c.withValues(alpha: 0.3))),
      child: Column(children: [
        Text(v, style: TextStyle(fontWeight: FontWeight.bold, color: c, fontSize: 22)),
        Text(l, style: const TextStyle(color: AppColors.steelBlue, fontSize: 12)),
      ]));

  Widget _leg(Color c, String l) => Row(children: [
        Container(width: 12, height: 12, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
        const SizedBox(width: 4),
        Text(l, style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
      ]);
}
