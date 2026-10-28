import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/customer_display.dart';
import '../../../shared/router/app_transitions.dart';
import '../../../shared/widgets/premium_ui.dart';

class VisitHistoryScreen extends StatefulWidget {
  const VisitHistoryScreen({super.key});

  @override
  State<VisitHistoryScreen> createState() => _VisitHistoryScreenState();
}

enum _Range { today, week, month, all }

class _VisitHistoryScreenState extends State<VisitHistoryScreen> {
  List<Map<String, dynamic>> _visits = [];
  bool _loading = true;
  String? _error;
  _Range _range = _Range.today;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  static String _ymd(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Map<String, String> _rangeParams() {
    final now = DateTime.now();
    switch (_range) {
      case _Range.today:
        return {'from': _ymd(now), 'to': _ymd(now)};
      case _Range.week:
        return {'from': _ymd(now.subtract(const Duration(days: 6))), 'to': _ymd(now)};
      case _Range.month:
        return {'from': _ymd(DateTime(now.year, now.month, 1)), 'to': _ymd(now)};
      case _Range.all:
        return {};
    }
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await DioClient.instance.get(ApiEndpoints.visits, queryParameters: _rangeParams());
      if (res.data['success'] == true) {
        _visits = List<Map<String, dynamic>>.from(res.data['data'] ?? []);
      } else {
        _error = res.data['message']?.toString() ?? 'Failed to load visits';
      }
    } catch (_) {
      _error = 'Could not load visits. Check your connection and try again.';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    final q = _searchController.text.trim().toLowerCase();
    if (q.isEmpty) return _visits;
    return _visits.where((v) {
      final c = v['users'] is Map ? v['users'] as Map : null;
      return customerSearchText(c).contains(q) ||
          (v['notes'] ?? '').toString().toLowerCase().contains(q);
    }).toList();
  }

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  static String _stamp(dynamic iso) {
    final d = DateTime.tryParse(iso?.toString() ?? '')?.toLocal();
    if (d == null) return '—';
    final h12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final ap = d.hour >= 12 ? 'PM' : 'AM';
    return '${d.day} ${_months[d.month - 1]} ${d.year} · $h12:${d.minute.toString().padLeft(2, '0')}:${d.second.toString().padLeft(2, '0')} $ap';
  }

  @override
  Widget build(BuildContext context) {
    final list = _filtered;
    final customers = list.map((v) => v['customer_id']).toSet().length;

    return Scaffold(
      backgroundColor: kCardBg,
      appBar: premiumAppBar(
        'Visit History',
        subtitle: '${list.length} visits · $customers customers',
        onBack: () => goBack(context, '/salesman-dashboard'),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: kNavy,
        foregroundColor: Colors.white,
        onPressed: () => context.push('/record-visit'),
        icon: const Icon(Icons.add_location_alt_outlined),
        label: const Text('Record Visit', style: TextStyle(fontWeight: FontWeight.w700)),
        elevation: 4,
      ),
      body: Column(children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
          child: Column(children: [
            PremiumSearchBar(
              hint: 'Search customer or notes...',
              onChanged: (v) {
                _searchController.text = v;
                setState(() {});
              },
              margin: EdgeInsets.zero,
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 36,
              child: ListView(scrollDirection: Axis.horizontal, children: [
                _chip('Today', _Range.today),
                _chip('Last 7 days', _Range.week),
                _chip('This month', _Range.month),
                _chip('All', _Range.all),
              ]),
            ),
          ]),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: kNavy))
              : _error != null
                  ? _message(Icons.cloud_off_outlined, _error!, retry: true)
                  : list.isEmpty
                      ? _message(Icons.event_busy_outlined, 'No visits in this period.\nTap "Record Visit" to add one.')
                      : RefreshIndicator(
                          color: kGreen,
                          onRefresh: _load,
                          child: ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 14, 16, 96),
                            itemCount: list.length,
                            itemBuilder: (_, i) => _visitCard(list[i]),
                          ),
                        ),
        ),
      ]),
    );
  }

  Widget _chip(String label, _Range r) {
    final selected = _range == r;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: () {
          if (_range == r) return;
          setState(() => _range = r);
          _load();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: selected ? kNavy : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: selected ? kNavy : const Color(0xFFE0E5EF)),
            boxShadow: selected ? [BoxShadow(color: kNavy.withValues(alpha: 0.25), blurRadius: 6, offset: const Offset(0, 2))] : [],
          ),
          child: Text(label,
              style: TextStyle(
                  color: selected ? Colors.white : kNavy,
                  fontWeight: FontWeight.w700,
                  fontSize: 12)),
        ),
      ),
    );
  }

  Widget _message(IconData icon, String text, {bool retry = false}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 52, color: kTextMuted.withValues(alpha: 0.5)),
          const SizedBox(height: 12),
          Text(text, textAlign: TextAlign.center, style: const TextStyle(color: kTextMuted, fontSize: 14)),
          if (retry) ...[
            const SizedBox(height: 14),
            GestureDetector(
              onTap: _load,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                decoration: BoxDecoration(color: kNavy.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(20)),
                child: const Text('Try again', style: TextStyle(color: kNavy, fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ]),
      ),
    );
  }

  Widget _visitCard(Map<String, dynamic> v) {
    final c = v['users'] is Map ? v['users'] as Map : null;
    final title = customerTitle(c);
    final person = (c?['full_name'] ?? '').toString();
    final shop = (c?['shop_name'] ?? '').toString().trim();
    final notes = (v['notes'] ?? '').toString();
    final followUp = (v['follow_up_date'] ?? '').toString();
    final initials = title.isNotEmpty ? title[0].toUpperCase() : '?';

    return PremiumCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: kNavy.withValues(alpha: 0.08),
            child: Text(initials, style: const TextStyle(color: kNavy, fontWeight: FontWeight.w700, fontSize: 14)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 14)),
              if (shop.isNotEmpty && person.isNotEmpty)
                Text(person, style: const TextStyle(color: kTextMuted, fontSize: 11)),
            ]),
          ),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          const Icon(Icons.schedule_rounded, size: 14, color: kTextMuted),
          const SizedBox(width: 6),
          Text(_stamp(v['visited_at']),
              style: const TextStyle(color: kNavy, fontSize: 12, fontWeight: FontWeight.w600)),
        ]),
        if (notes.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(notes, style: const TextStyle(color: Color(0xFF4B5563), fontSize: 13)),
        ],
        if (followUp.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(children: [
            const Icon(Icons.event_repeat_rounded, size: 14, color: kTextMuted),
            const SizedBox(width: 6),
            Text('Follow-up: $followUp', style: const TextStyle(color: kTextMuted, fontSize: 12)),
          ]),
        ],
      ]),
    );
  }
}
