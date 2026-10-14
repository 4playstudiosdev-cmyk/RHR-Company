import 'dart:async';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/dio_client.dart';

/// Admin-managed image/video carousel for the middle of the customer
/// app's home screen — auto-slides every few seconds. Backed by
/// promo_banners (see RHR-backend's promoBanners.controller.js);
/// renders nothing at all if the admin hasn't added any banners yet.
class PromoSlider extends StatefulWidget {
  const PromoSlider({super.key});

  @override
  State<PromoSlider> createState() => _PromoSliderState();
}

class _PromoSliderState extends State<PromoSlider> {
  List<Map<String, dynamic>> _banners = [];
  bool _loading = true;
  final _pageController = PageController();
  Timer? _timer;
  int _currentPage = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final res = await DioClient.instance.get(ApiEndpoints.promoBanners);
      if (res.data['success'] == true) {
        final banners = List<Map<String, dynamic>>.from(res.data['data'] ?? []);
        if (mounted) setState(() => _banners = banners);
        if (banners.length > 1) _startAutoSlide();
      }
    } catch (e) {
      debugPrint('Promo banners load error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _startAutoSlide() {
    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted || !_pageController.hasClients) return;
      _currentPage = (_currentPage + 1) % _banners.length;
      _pageController.animateToPage(_currentPage,
          duration: const Duration(milliseconds: 500), curve: Curves.easeInOut);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _banners.isEmpty) return const SizedBox.shrink();

    return Column(children: [
      SizedBox(
        height: 160,
        child: PageView.builder(
          controller: _pageController,
          itemCount: _banners.length,
          onPageChanged: (i) => setState(() => _currentPage = i),
          itemBuilder: (_, i) => ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.lg),
            child: _BannerSlide(banner: _banners[i]),
          ),
        ),
      ),
      if (_banners.length > 1) ...[
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(_banners.length, (i) => Container(
            margin: const EdgeInsets.symmetric(horizontal: 3),
            width: i == _currentPage ? 16 : 6,
            height: 6,
            decoration: BoxDecoration(
              color: i == _currentPage ? AppColors.primary : AppColors.outlineVariant,
              borderRadius: BorderRadius.circular(3),
            ),
          )),
        ),
      ],
    ]);
  }
}

class _BannerSlide extends StatefulWidget {
  final Map<String, dynamic> banner;
  const _BannerSlide({required this.banner});

  @override
  State<_BannerSlide> createState() => _BannerSlideState();
}

class _BannerSlideState extends State<_BannerSlide> {
  VideoPlayerController? _videoController;

  @override
  void initState() {
    super.initState();
    if (widget.banner['media_type'] == 'video') {
      _videoController = VideoPlayerController.networkUrl(Uri.parse(widget.banner['media_url']))
        ..initialize().then((_) {
          if (!mounted) return;
          setState(() {});
          _videoController!.setLooping(true);
          _videoController!.setVolume(0);
          _videoController!.play();
        });
    }
  }

  @override
  void dispose() {
    _videoController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.banner['media_type'] == 'video') {
      if (_videoController == null || !_videoController!.value.isInitialized) {
        return Container(color: AppColors.surfaceVariant, child: const Center(child: CircularProgressIndicator(color: AppColors.primary)));
      }
      return FittedBox(
        fit: BoxFit.cover,
        clipBehavior: Clip.hardEdge,
        child: SizedBox(
          width: _videoController!.value.size.width,
          height: _videoController!.value.size.height,
          child: VideoPlayer(_videoController!),
        ),
      );
    }
    return Image.network(
      widget.banner['media_url'],
      width: double.infinity,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => Container(color: AppColors.surfaceVariant),
    );
  }
}
