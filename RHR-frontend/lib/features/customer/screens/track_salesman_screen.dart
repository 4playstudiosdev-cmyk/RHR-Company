import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/widgets/rhr_button.dart';
import '../../../shared/router/app_transitions.dart';

/// "My Salesman" — a plain profile card (name, phone, photo) for the
/// salesman assigned to this customer. Replaces the old live-location
/// "Track Salesman" map: a customer no longer sees their salesman's
/// position, only who they are and how to call them.
class TrackSalesmanScreen extends StatefulWidget {
  const TrackSalesmanScreen({super.key});

  @override
  State<TrackSalesmanScreen> createState() => _TrackSalesmanScreenState();
}

class _TrackSalesmanScreenState extends State<TrackSalesmanScreen> {
  bool _isLoading = true;
  String? _error;
  bool _assigned = false;
  String? _salesmanName;
  String? _salesmanPhone;
  String? _salesmanPhoto;
  String? _salesmanPosition;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _isLoading = true);
    try {
      final response = await DioClient.instance.get('/api/v1/customers/me/salesman');
      if (response.data['success'] == true) {
        final data = response.data['data'] as Map<String, dynamic>;
        final assigned = data['assigned'] == true;
        final salesman = data['salesman'] as Map<String, dynamic>?;
        setState(() {
          _assigned = assigned;
          _salesmanName = salesman?['full_name'] as String?;
          _salesmanPhone = salesman?['phone'] as String?;
          _salesmanPhoto = salesman?['profile_photo_url'] as String?;
          _salesmanPosition = salesman?['position'] as String?;
          _error = null;
        });
      } else {
        setState(() => _error = response.data['message'] ?? 'Failed to load your salesman');
      }
    } catch (e) {
      setState(() => _error = 'Failed to load your salesman');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _call() async {
    if (_salesmanPhone == null) return;
    final uri = Uri(scheme: 'tel', path: _salesmanPhone);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.warmGrey,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => goBack(context, '/profile'),
        ),
        title: const Text('My Salesman',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : _error != null
              ? Center(child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(_error!, textAlign: TextAlign.center,
                        style: const TextStyle(color: AppColors.steelBlue)),
                    const SizedBox(height: 16),
                    RHRButton(text: 'Retry', onPressed: () => _load()),
                  ]),
                ))
              : !_assigned
                  ? const Center(child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('No salesman assigned to your account yet.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppColors.steelBlue, fontSize: 14)),
                    ))
                  : Center(
                      child: Container(
                        margin: const EdgeInsets.all(24),
                        padding: const EdgeInsets.all(28),
                        width: double.infinity,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
                        ),
                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                          CircleAvatar(
                            radius: 48,
                            backgroundColor: AppColors.navy,
                            backgroundImage: _salesmanPhoto != null ? NetworkImage(_salesmanPhoto!) : null,
                            child: _salesmanPhoto == null
                                ? const Icon(Icons.handshake_outlined, color: Colors.white, size: 40)
                                : null,
                          ),
                          const SizedBox(height: 16),
                          Text(_salesmanName ?? 'Your Salesman',
                              style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.bold, fontSize: 20)),
                          if (_salesmanPosition != null) ...[
                            const SizedBox(height: 4),
                            Text(_salesmanPosition!, style: const TextStyle(color: AppColors.steelBlue, fontSize: 13)),
                          ],
                          if (_salesmanPhone != null) ...[
                            const SizedBox(height: 4),
                            Text(_salesmanPhone!, style: const TextStyle(color: AppColors.steelBlue, fontSize: 14)),
                          ],
                          const SizedBox(height: 20),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: _call,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.orange,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 14),
                              ),
                              icon: const Icon(Icons.call),
                              label: const Text('Call'),
                            ),
                          ),
                        ]),
                      ),
                    ),
    );
  }
}
