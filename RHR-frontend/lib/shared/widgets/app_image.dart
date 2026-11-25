import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Network image with a disk cache: a photo is downloaded once and then
/// shown straight from the phone's storage — on the next app open too — instead
/// of being fetched again every time (what plain Image.network did).
/// Same parameters as the Image.network calls it replaces.
class AppImage {
  AppImage._();

  static const _placeholder = Color(0xFFF1F5F9);

  static Widget network(
    String url, {
    Key? key,
    BoxFit? fit,
    double? width,
    double? height,
    Alignment alignment = Alignment.center,
    ImageErrorWidgetBuilder? errorBuilder,
  }) {
    return Builder(
      key: key,
      builder: (context) {
        // Decode at the size it is drawn (not the full photo) — less memory, smoother lists.
        final dpr = MediaQuery.maybeDevicePixelRatioOf(context) ?? 2.0;
        final int? decodeWidth = (width != null && width.isFinite) ? (width * dpr).round() : null;
        return CachedNetworkImage(
          imageUrl: url,
          fit: fit,
          width: width,
          height: height,
          alignment: alignment,
          memCacheWidth: decodeWidth,
          fadeInDuration: const Duration(milliseconds: 150),
          fadeOutDuration: Duration.zero,
          placeholder: (_, __) => Container(width: width, height: height, color: _placeholder),
          errorWidget: (ctx, _, err) => errorBuilder != null
              ? errorBuilder(ctx, err, null)
              : Container(
                  width: width,
                  height: height,
                  color: _placeholder,
                  alignment: Alignment.center,
                  child: const Icon(Icons.broken_image_outlined, color: Colors.grey),
                ),
        );
      },
    );
  }
}
