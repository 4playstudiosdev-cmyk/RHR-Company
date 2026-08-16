import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/tap_scale.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>> _notifs = [];
  final Set<String> _readIds = {};
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _isLoading = true);
    try {
      final response = await DioClient.instance.get('/api/v1/notifications');
      if (response.data['success'] == true) {
        setState(() {
          _notifs = List<Map<String, dynamic>>.from(response.data['data'] ?? []);
        });
      }
    } catch (e) {
      debugPrint('Notifications error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  int get _unread => _notifs.where((n) => !_readIds.contains(n['id'])).length;

  IconData _icon(String t) {
    if (t == 'order') return Icons.shopping_bag_outlined;
    if (t == 'payment') return Icons.payments_outlined;
    return Icons.campaign_outlined;
  }

  Color _icolor(String t) {
    if (t == 'order') return AppColors.navy;
    if (t == 'payment') return AppColors.success;
    return AppColors.orange;
  }

  String _timeAgo(String? iso) {
    if (iso == null) return '';
    final date = DateTime.tryParse(iso);
    if (date == null) return '';
    final diff = DateTime.now().difference(date);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
    if (diff.inHours < 24) return '${diff.inHours} hour${diff.inHours == 1 ? '' : 's'} ago';
    return '${diff.inDays} day${diff.inDays == 1 ? '' : 's'} ago';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => context.go('/home')),
        title: Text('Notifications${_unread > 0 ? ' ($_unread)' : ''}',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [if (_unread > 0) TextButton(onPressed: () => setState(() {
              for (final n in _notifs) { _readIds.add(n['id'].toString()); }
            }),
            child: const Text('Mark all read',
                style: TextStyle(color: AppColors.orange, fontSize: 12)))],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : _notifs.isEmpty
          ? const Center(child: Column(mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.notifications_none, size: 72, color: AppColors.disabled),
                SizedBox(height: 16),
                Text('No notifications', style: TextStyle(color: AppColors.steelBlue, fontSize: 16)),
              ]))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _notifs.length,
              itemBuilder: (_, i) {
                final n = _notifs[i];
                final id = n['id'].toString();
                final unread = !_readIds.contains(id);
                final type = (n['type'] ?? 'broadcast') as String;
                return StaggeredFadeIn(
                  index: i,
                  child: TapScale(
                  onTap: () => setState(() => _readIds.add(id)),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                        color: unread ? AppColors.navy.withValues(alpha: 0.05) : AppColors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: unread ? Border.all(color: AppColors.navy.withValues(alpha: 0.15)) : null,
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)]),
                    child: Row(children: [
                      Container(width: 44, height: 44,
                          decoration: BoxDecoration(
                              color: _icolor(type).withValues(alpha: 0.1),
                              shape: BoxShape.circle),
                          child: Icon(_icon(type),
                              color: _icolor(type), size: 22)),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text(n['title'] as String? ?? '',
                              style: TextStyle(fontWeight: unread ? FontWeight.bold : FontWeight.w500,
                                  color: AppColors.navy, fontSize: 13))),
                          if (unread) Container(width: 8, height: 8,
                              decoration: const BoxDecoration(color: AppColors.orange, shape: BoxShape.circle)),
                        ]),
                        const SizedBox(height: 4),
                        Text(n['body'] as String? ?? '',
                            style: const TextStyle(color: AppColors.steelBlue, fontSize: 12),
                            maxLines: 2, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 4),
                        Text(_timeAgo(n['created_at'] as String?),
                            style: const TextStyle(color: AppColors.disabled, fontSize: 10)),
                      ])),
                    ]),
                  ),
                  ),
                );
              }),
    );
  }
}
