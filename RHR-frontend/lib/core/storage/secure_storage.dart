import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true, // backed by Android Keystore
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock,
    ),
  );
  static const _tokenKey     = 'jwt_token';
  static const _roleKey      = 'user_role';
  static const _fullNameKey  = 'user_full_name';
  static const _userIdKey    = 'user_id';
  static const _phoneKey     = 'user_phone';
  static const _positionKey  = 'user_position';
  static const _carNumberKey = 'user_car_number';
  static const _loginTimeKey = 'login_time';
  static const _locationConsentKey = 'location_disclosure_accepted';
  static const _shopLocationConsentKey = 'shop_location_disclosure_accepted';
  static const _profileCompleteKey = 'customer_profile_complete';
  static const _salesmanProfileCompleteKey = 'salesman_profile_complete';
  static const _driverProfileCompleteKey = 'driver_profile_complete';

  // ── In-memory copy ──
  // Each read of Android's encrypted storage costs ~0.4 s on a budget phone,
  // and the reads queue up one behind another. The token was read before EVERY
  // API call (so "parallel" requests still went out 0.4 s apart) and the splash
  // screen did several more. Everything is read once (one readAll) and kept in
  // memory; writes update both. Background isolates (GPS task) have their own
  // memory, so they use getTokenFresh() instead.
  static Map<String, String>? _cache;
  static Future<Map<String, String>>? _loading;

  static Future<Map<String, String>> _all() {
    final c = _cache;
    if (c != null) return Future.value(c);
    return _loading ??= _storage.readAll().then((m) {
      _cache = Map<String, String>.of(m);
      _loading = null;
      return _cache!;
    }, onError: (Object e) {
      _loading = null;
      throw e;
    });
  }

  static Future<String?> _read(String key) async {
    try {
      return (await _all())[key];
    } catch (_) {
      return _storage.read(key: key); // readAll failed — fall back to a direct read
    }
  }

  static Future<void> _write(String key, String value) async {
    try {
      (await _all())[key] = value;
    } catch (_) {/* cache unavailable — storage below is still the truth */}
    await _storage.write(key: key, value: value);
  }

  /// Reads the token straight from storage (no in-memory copy) — for the
  /// background GPS isolate, which must see a re-login done in the app.
  static Future<String?> getTokenFresh() => _storage.read(key: _tokenKey);

  // Session lifetime — a stored token older than this is treated as
  // expired even if the backend JWT itself hasn't expired yet, and forces
  // a fresh login instead of silently trusting an old device.
  static const _sessionMaxAge = Duration(days: 7);

  // Save token after login — also stamps the login time for session-expiry
  // checks (see isSessionExpired/isLoggedIn below).
  static Future<void> saveToken(String token) async {
    await _write(_tokenKey, token);
    await _write(_loginTimeKey, DateTime.now().millisecondsSinceEpoch.toString());
  }

  // Read token for API calls
  static Future<String?> getToken() async {
    return await _read(_tokenKey);
  }

  // Save user role (customer or salesman)
  static Future<void> saveRole(String role) async {
    await _write(_roleKey, role);
  }

  // Read role for routing
  static Future<String?> getRole() async {
    return await _read(_roleKey);
  }

  // Save the logged-in user's display name (from login/verify-otp response)
  static Future<void> saveFullName(String fullName) async {
    await _write(_fullNameKey, fullName);
  }

  static Future<String?> getFullName() async {
    return await _read(_fullNameKey);
  }

  // Save the logged-in user's own ID (needed for ledger/profile calls)
  static Future<void> saveUserId(String id) async {
    await _write(_userIdKey, id);
  }

  static Future<String?> getUserId() async {
    return await _read(_userIdKey);
  }

  static Future<void> savePhone(String phone) async {
    await _write(_phoneKey, phone);
  }

  static Future<String?> getPhone() async {
    return await _read(_phoneKey);
  }

  static Future<void> savePosition(String position) async {
    await _write(_positionKey, position);
  }

  static Future<String?> getPosition() async {
    return await _read(_positionKey);
  }

  static Future<void> saveCarNumber(String carNumber) async {
    await _write(_carNumberKey, carNumber);
  }

  static Future<String?> getCarNumber() async {
    return await _read(_carNumberKey);
  }

  // Whether the user has already tapped "I Understand & Allow" on the
  // Google-Play-required location disclosure dialog (see
  // widgets/location_disclosure_dialog.dart) — cleared on logout like
  // everything else here, so it's shown again on the next login, not
  // just once per app install.
  static Future<void> saveLocationConsent(bool accepted) async {
    await _write(_locationConsentKey, accepted.toString());
  }

  static Future<bool> getLocationConsent() async {
    return (await _read(_locationConsentKey)) == 'true';
  }

  // Separate consent flag for the customer-facing "Set Shop Location"
  // one-time GPS grab (see LocationService/profile_screen.dart) — a
  // distinct use case from salesman/driver background tracking above,
  // so it gets its own disclosure and its own consent flag.
  static Future<void> saveShopLocationConsent(bool accepted) async {
    await _write(_shopLocationConsentKey, accepted.toString());
  }

  static Future<bool> getShopLocationConsent() async {
    return (await _read(_shopLocationConsentKey)) == 'true';
  }

  // Whether this customer has filled in every required "Complete Your
  // Profile" field (see customers.controller.js's isProfileComplete) —
  // drives the forced redirect to /profile-setup on login/app-restore.
  static Future<void> saveProfileComplete(bool complete) async {
    await _write(_profileCompleteKey, complete.toString());
  }

  static Future<bool> getProfileComplete() async {
    return (await _read(_profileCompleteKey)) == 'true';
  }

  // Same idea as saveProfileComplete/getProfileComplete above, for the
  // salesman/driver "Complete Your Profile" flows (see
  // salesmen.routes.js / drivers.routes.js's own isProfileComplete) —
  // each role gets its own key since they're gated independently.
  static Future<void> saveSalesmanProfileComplete(bool complete) async {
    await _write(_salesmanProfileCompleteKey, complete.toString());
  }

  static Future<bool> getSalesmanProfileComplete() async {
    return (await _read(_salesmanProfileCompleteKey)) == 'true';
  }

  static Future<void> saveDriverProfileComplete(bool complete) async {
    await _write(_driverProfileCompleteKey, complete.toString());
  }

  static Future<bool> getDriverProfileComplete() async {
    return (await _read(_driverProfileCompleteKey)) == 'true';
  }

  // Clear everything on logout
  static Future<void> clearToken() async {
    _cache = <String, String>{};
    _loading = null;
    await _storage.deleteAll();
  }

  // Alias — same as clearToken, named to match logout/401 call sites that
  // read more clearly as "clear everything" than "clear token".
  static Future<void> clearAll() => clearToken();

  static Future<bool> isSessionExpired() async {
    final loginTime = await _read(_loginTimeKey);
    if (loginTime == null) return true;
    final elapsed = DateTime.now().millisecondsSinceEpoch - int.parse(loginTime);
    return elapsed > _sessionMaxAge.inMilliseconds;
  }

  // True only if a token exists AND the 7-day session window hasn't
  // lapsed. Clears storage as a side effect when expired, so callers can
  // treat a false result as "safe to show the login screen".
  static Future<bool> isLoggedIn() async {
    final token = await getToken();
    if (token == null) return false;
    if (await isSessionExpired()) {
      await clearAll();
      return false;
    }
    return true;
  }
}
