import 'package:flutter/material.dart';
import '../../../core/storage/secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/staggered_fade_in.dart';
import '../../../shared/widgets/shimmer_box.dart';
import '../../../shared/router/app_transitions.dart';
import '../../../shared/widgets/premium_ui.dart';

class CustomerDetailScreen extends StatefulWidget {
  final String? customerId;
  const CustomerDetailScreen({super.key, this.customerId});

  @override
  State<CustomerDetailScreen> createState() => _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends State<CustomerDetailScreen> {
  Map<String, dynamic>? _customer;
  List<Map<String, dynamic>> _ledger  = [];
  num _outstandingBalance = 0;
  bool _isLoading = true;
  bool _isDriver = false;

  @override
  void initState() {
    super.initState();
    SecureStorage.getRole().then((r) {
      if (r == 'driver' && mounted) setState(() => _isDriver = true);
    });
    if (widget.customerId != null) _loadData();
  }

  Future<void> _loadData() async {
    try {
      final custRes = await DioClient.instance.get('${ApiEndpoints.customers}/${widget.customerId}');
      if (custRes.data['success'] == true) {
        _customer = custRes.data['data'] as Map<String, dynamic>;
      }

      final ledgerRes = await DioClient.instance.get('${ApiEndpoints.ledger}${widget.customerId}');
      if (ledgerRes.data['success'] == true) {
        final ledgerData = ledgerRes.data['data'] as Map<String, dynamic>? ?? {};
        _ledger = List<Map<String, dynamic>>.from(ledgerData['entries'] ?? []);
        _outstandingBalance = (ledgerData['currentBalance'] ?? 0) as num;
      }

      setState(() {});
    } catch (e) {
      debugPrint('Customer detail error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final personName = (_customer?['full_name'] ?? '—').toString();
    final phone    = _customer?['phone']     ?? '—';
    final shopName = (_customer?['shop_name'] ?? '').toString();
    final name     = shopName.isNotEmpty ? shopName : personName;
    final addr     = (_customer?['shop_address'] ?? '').toString();
    final city     = (_customer?['city'] ?? '').toString();
    final area     = (_customer?['area'] ?? '').toString();
    final lat      = _customer?['shop_latitude'];
    final lng      = _customer?['shop_longitude'];
    final hasLocation = lat != null && lng != null;
    final creditLimit = _customer?['credit_limit'];
    final photoUrl = (_customer?['profile_photo_url'] ?? '').toString();
    final initials = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return Scaffold(
      backgroundColor: kCardBg,
      appBar: premiumAppBar(
        name,
        onBack: () => goBack(context, '/my-customers'),
      ),
      body: _isLoading
          ? ListView(
              padding: const EdgeInsets.all(16),
              children: const [
                ShimmerBox(height: 130, borderRadius: BorderRadius.all(Radius.circular(16))),
                SizedBox(height: 16),
                ShimmerListRow(),
                ShimmerListRow(),
                ShimmerListRow(),
              ],
            )
          : _customer == null
              ? const Center(child: Text('Customer not found.', style: TextStyle(color: kTextMuted)))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    // Profile card
                    StaggeredFadeIn(index: 0, child: Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [kNavyDark, kNavyLight],
                        ),
                        borderRadius: BorderRadius.circular(18),
                        boxShadow: [BoxShadow(color: kNavy.withValues(alpha: 0.35), blurRadius: 14, offset: const Offset(0, 5))],
                      ),
                      child: Row(children: [
                        CircleAvatar(
                          radius: 34,
                          backgroundColor: Colors.white.withValues(alpha: 0.15),
                          backgroundImage: photoUrl.isNotEmpty ? NetworkImage(photoUrl) : null,
                          child: photoUrl.isEmpty
                              ? Text(initials, style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800))
                              : null,
                        ),
                        const SizedBox(width: 16),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17)),
                          if (shopName.isNotEmpty)
                            Text(personName, style: const TextStyle(color: Colors.white60, fontSize: 12)),
                          const SizedBox(height: 2),
                          Row(children: [
                            const Icon(Icons.phone_outlined, size: 13, color: Colors.white54),
                            const SizedBox(width: 4),
                            Text(phone.toString(), style: const TextStyle(color: Colors.white70, fontSize: 13)),
                          ]),
                          if (addr.isNotEmpty || city.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text([area, city, addr].where((s) => s.isNotEmpty).take(2).join(', '),
                                style: const TextStyle(color: Colors.white54, fontSize: 12)),
                          ],
                        ])),
                      ]),
                    )),
                    const SizedBox(height: 14),

                    // Location button
                    if (hasLocation)
                      StaggeredFadeIn(index: 1, child: GestureDetector(
                        onTap: () async {
                          final uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$lat,$lng');
                          if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
                        },
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFE0E5EF)),
                            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)],
                          ),
                          child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                            Icon(Icons.location_on_rounded, size: 18, color: kNavy),
                            SizedBox(width: 8),
                            Text('Open in Google Maps', style: TextStyle(color: kNavy, fontWeight: FontWeight.w700, fontSize: 14)),
                          ]),
                        ),
                      )),
                    if (hasLocation) const SizedBox(height: 14),

                    // Stats
                    Row(children: [
                      Expanded(child: StaggeredFadeIn(index: 2, child: _statCard(
                          'Outstanding',
                          'PKR ${_outstandingBalance.toStringAsFixed(0)}',
                          _outstandingBalance > 0 ? kRed : kGreen))),
                      const SizedBox(width: 12),
                      Expanded(child: StaggeredFadeIn(index: 3, child: _statCard(
                          creditLimit != null ? 'Credit Limit' : 'Ledger Entries',
                          creditLimit != null ? 'PKR $creditLimit' : '${_ledger.length}',
                          kNavy))),
                    ]),
                    const SizedBox(height: 16),

                    // Action buttons
                    Row(children: [
                      Expanded(child: _actionButton('New Order', Icons.add_shopping_cart_rounded, kNavy,
                          () => context.push('/create-order'))),
                      if (!_isDriver) const SizedBox(width: 12),
                      if (!_isDriver) Expanded(child: _actionButton('Record Payment', Icons.payments_rounded, kGreen,
                          () => context.push('/record-payment', extra: widget.customerId))),
                    ]),
                    const SizedBox(height: 20),

                    // Ledger
                    const SectionHeader(title: 'Ledger'),
                    const SizedBox(height: 10),
                    if (_ledger.isEmpty)
                      const PremiumEmpty(icon: Icons.receipt_long_outlined, title: 'No ledger entries')
                    else
                      ..._ledger.asMap().entries.map((mapEntry) {
                        final entry  = mapEntry.value;
                        final desc   = entry['description'] ?? entry['notes'] ?? 'Entry';
                        final amount = entry['amount'] ?? entry['debit'] ?? 0;
                        final date   = (entry['created_at'] ?? '').toString();
                        final shortDate = date.length >= 10 ? date.substring(0, 10) : date;
                        return StaggeredFadeIn(
                            index: mapEntry.key,
                            child: _ledgerRow(desc.toString(), shortDate, 'PKR $amount'));
                      }),
                    const SizedBox(height: 20),
                  ]),
                ),
    );
  }

  Widget _statCard(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
      ),
      child: Column(children: [
        Text(value, style: TextStyle(fontWeight: FontWeight.w800, color: color, fontSize: 14)),
        const SizedBox(height: 4),
        Text(label, textAlign: TextAlign.center,
            style: const TextStyle(color: kTextMuted, fontSize: 11)),
      ]),
    );
  }

  Widget _actionButton(String label, IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(color: color.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 3))],
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon, color: Colors.white, size: 18),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
        ]),
      ),
    );
  }

  Widget _ledgerRow(String desc, String date, String amount) {
    return PremiumCard(
      margin: const EdgeInsets.only(bottom: 8),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(desc, style: const TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 13)),
          Text(date, style: const TextStyle(color: kTextMuted, fontSize: 11)),
        ])),
        Text(amount, style: const TextStyle(fontWeight: FontWeight.w700, color: kNavy, fontSize: 13)),
      ]),
    );
  }
}
