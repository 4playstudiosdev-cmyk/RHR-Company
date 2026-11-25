import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:hive_flutter/hive_flutter.dart';

/// Last good answer of every GET request, kept on the phone, so every screen
/// can still show its data (customers, products, orders, ledger, payments...)
/// when the internet drops. Saved per logged-in user.
///
/// Two entries per answer: the exact request (path + query) and the path alone
/// (latest of any query), so a screen asking with slightly different filters
/// than the one that was saved still gets data offline.
class ApiCache {
  ApiCache._();

  static const boxName = 'api_cache';
  static Box<String>? _box;

  static Future<void> init() async {
    _box ??= await Hive.openBox<String>(boxName);
  }

  static String _query(RequestOptions o) {
    final q = o.queryParameters.entries.toList()..sort((a, b) => a.key.compareTo(b.key));
    return q.map((e) => '${e.key}=${e.value}').join('&');
  }

  static String _exactKey(String user, RequestOptions o) => '$user|${o.path}?${_query(o)}';
  static String _pathKey(String user, RequestOptions o) => '$user|${o.path}';

  static Future<void> save(String user, RequestOptions o, dynamic data) async {
    final box = _box;
    if (box == null || data == null) return;
    // Only plain JSON answers — never files / PDFs.
    if (data is! Map && data is! List) return;
    try {
      final entry = jsonEncode({'at': DateTime.now().toIso8601String(), 'data': data});
      await box.put(_exactKey(user, o), entry);
      await box.put(_pathKey(user, o), entry);
    } catch (_) {/* not cacheable — ignore */}
  }

  /// The saved answer for this request, or null.
  static Response<dynamic>? read(String user, RequestOptions o) {
    final box = _box;
    if (box == null) return null;
    final raw = box.get(_exactKey(user, o)) ?? box.get(_pathKey(user, o));
    if (raw == null) return null;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      return Response<dynamic>(
        requestOptions: o,
        statusCode: 200,
        data: m['data'],
        extra: {'fromCache': true, 'cachedAt': m['at']},
      );
    } catch (_) {
      return null;
    }
  }

  static bool has(String user, RequestOptions o) =>
      _box?.containsKey(_exactKey(user, o)) == true || _box?.containsKey(_pathKey(user, o)) == true;

  /// On logout — the next person on this phone must not see this user's data.
  static Future<void> clear() async => _box?.clear();
}
