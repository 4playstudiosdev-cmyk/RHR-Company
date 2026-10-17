import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/customer_display.dart';
import '../../../shared/router/app_transitions.dart';

/// The salesman's own customer-visit history: which customer, what was
/// noted, and the exact date/time (to the second) each visit was marked.
/// Opened from the drawer ("Customer Visit History") and from the
/// "Customers Visited" card on the home screen.
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
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await DioClient.instance.get(ApiEndpoints.visits, queryParameters: _rangeParams());
      if (res.data['success'] == true) {
        _visits = List<Map<String, dynamic>>.from(res.data['data'] ?? []);
      } else {
        _error = res.data['message']?.toString() ?? 'Failed to load visits';
      }
    } catch (e) {
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

  // 17 Oct 2026 · 4:47:32 PM — the salesman's local time, with seconds.
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
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => goBack(context, '/salesman-dashboard'),
        ),
        title: const Text('Customer Visit History',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.orange,
        foregroundColor: Colors.white,
        onPressed: () => context.push('/record-visit'),
        icon: const Icon(Icons.add_location_alt_outlined),
        label: const Text('Record Visit'),
      ),
      body: Column(children: [
        Container(
          color: AppColors.white,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Column(children: [
            TextField(
              controller: _searchController,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Search customer or notes...',
                prefixIcon: const Icon(Icons.search, color: AppColors.steelBlue),
                filled: true,
                fillColor: AppColors.warmGrey,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 38,
              child: ListView(scrollDirection: Axis.horizontal, children: [
                _chip('Today', _Range.today),
                _chip('Last 7 days', _Range.week),
                _chip('This month', _Range.month),
                _chip('All', _Range.all),
              ]),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
          child: Row(children: [
            Text('${list.length} visit${list.length == 1 ? '' : 's'} · $customers customer${customers == 1 ? '' : 's'}',
                style: const TextStyle(color: AppColors.steelBlue, fontSize: 12, fontWeight: FontWeight.w600)),
          ]),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
              : _error != null
                  ? _message(Icons.cloud_off_outlined, _error!, retry: true)
                  : list.isEmpty
                      ? _message(Icons.event_busy_outlined, 'No visits in this period.\nTap "Record Visit" to add one.')
                      : RefreshIndicator(
                          color: AppColors.orange,
                          onRefresh: _load,
                          child: ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
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
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        selectedColor: AppColors.orange,
        labelStyle: TextStyle(color: selected ? Colors.white : AppColors.navy, fontWeight: FontWeight.w600, fontSize: 12),
        onSelected: (_) {
          if (_range == r) return;
          setState(() => _range = r);
          _load();
        },
      ),
    );
  }

  Widget _message(IconData icon, String text, {bool retry = false}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 48, color: AppColors.steelBlue.withValues(alpha: 0.5)),
          const SizedBox(height: 12),
          Text(text, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.steelBlue)),
          if (retry) ...[
            const SizedBox(height: 12),
            TextButton(onPressed: _load, child: const Text('Try again')),
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

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const CircleAvatar(
            radius: 18,
            backgroundColor: AppColors.navy,
            child: Icon(Icons.storefront_outlined, color: Colors.white, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title,
                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy, fontSize: 15)),
              if (shop.isNotEmpty && person.isNotEmpty)
                Text(person, style: const TextStyle(color: AppColors.steelBlue, fontSize: 11)),
            ]),
          ),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          const Icon(Icons.schedule, size: 14, color: AppColors.orange),
          const SizedBox(width: 6),
          Text(_stamp(v['visited_at']),
              style: const TextStyle(color: AppColors.navy, fontSize: 12, fontWeight: FontWeight.w600)),
        ]),
        if (notes.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(notes, style: const TextStyle(color: Color(0xFF4B5563), fontSize: 13)),
        ],
        if (followUp.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(children: [
            const Icon(Icons.event_repeat, size: 14, color: AppColors.steelBlue),
            const SizedBox(width: 6),
            Text('Follow-up: $followUp', style: const TextStyle(color: AppColors.steelBlue, fontSize: 12)),
          ]),
        ],
      ]),
    );
  }
}
