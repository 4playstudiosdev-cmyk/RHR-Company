import 'package:flutter/material.dart';

import '../../core/network/network_status.dart';
import '../../core/storage/hive_service.dart';
import '../../core/storage/sync_service.dart';
import '../router/app_router.dart';

/// Thin bar above every screen:
///  • offline → "Offline — showing saved data · N waiting to sync"
///  • online with items waiting → "N waiting to sync" + Sync now
///  • items the server refused during sync → "N couldn't be saved — tap to see"
/// Nothing is shown when online and everything is sent.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([NetworkStatus.online, HiveService.pending, HiveService.failed, SyncService.syncing]),
      builder: (context, _) {
        final online = NetworkStatus.isOnline;
        final pending = HiveService.pending.value;
        final failed = HiveService.failed.value;
        final syncing = SyncService.syncing.value;
        if (online && pending == 0 && failed == 0) return child;

        late final Color bg;
        late final IconData icon;
        late final String text;
        Widget? action;
        VoidCallback? onTap;
        if (!online) {
          bg = const Color(0xFFB45309);
          icon = Icons.cloud_off_rounded;
          text = pending > 0 ? 'Offline — showing saved data · $pending waiting to sync' : 'Offline — showing saved data';
          action = _chip('Retry', NetworkStatus.probe);
        } else if (pending > 0) {
          bg = const Color(0xFF1D4ED8);
          icon = Icons.cloud_upload_rounded;
          text = syncing ? 'Sending $pending saved item${pending == 1 ? '' : 's'}…' : '$pending saved item${pending == 1 ? '' : 's'} waiting to sync';
          action = syncing
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : _chip('Sync now', SyncService.syncAll);
        } else {
          bg = const Color(0xFFB91C1C);
          icon = Icons.error_outline_rounded;
          text = "$failed item${failed == 1 ? '' : 's'} couldn't be saved — tap to see";
          onTap = _showFailures;
        }

        return Column(children: [
          Material(
            color: bg,
            child: InkWell(
              onTap: onTap,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 6, 10, 6),
                  child: Row(children: [
                    Icon(icon, color: Colors.white, size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(text,
                          maxLines: 2,
                          style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w600)),
                    ),
                    if (action != null) action,
                  ]),
                ),
              ),
            ),
          ),
          Expanded(child: MediaQuery.removePadding(context: context, removeTop: true, child: child)),
        ]);
      },
    );
  }

  Widget _chip(String label, Future<dynamic> Function() onPressed) => TextButton(
        onPressed: () => onPressed(),
        style: TextButton.styleFrom(
          foregroundColor: Colors.white,
          backgroundColor: Colors.white24,
          minimumSize: const Size(0, 28),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
        ),
        child: Text(label),
      );

  static void _showFailures() {
    final ctx = appRouter.routerDelegate.navigatorKey.currentContext;
    if (ctx == null) return;
    final items = HiveService.getSyncFailures();
    showDialog<void>(
      context: ctx,
      builder: (dCtx) => AlertDialog(
        title: const Text("Couldn't be saved"),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.separated(
            shrinkWrap: true,
            itemCount: items.length,
            separatorBuilder: (_, __) => const Divider(height: 16),
            itemBuilder: (_, i) {
              final f = items[i];
              final at = DateTime.tryParse(f['at']?.toString() ?? '')?.toLocal();
              return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(f['what']?.toString() ?? 'Item', style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(f['message']?.toString() ?? '', style: const TextStyle(color: Color(0xFFB91C1C))),
                if (at != null)
                  Text('${at.day}/${at.month} ${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}',
                      style: const TextStyle(fontSize: 11, color: Colors.grey)),
              ]);
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await HiveService.clearSyncFailures();
              if (dCtx.mounted) Navigator.of(dCtx).pop();
            },
            child: const Text('Clear'),
          ),
          TextButton(onPressed: () => Navigator.of(dCtx).pop(), child: const Text('OK')),
        ],
      ),
    );
  }
}
