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
  static const _loginTimeKey = 'login_time';

  // Session lifetime — a stored token older than this is treated as
  // expired even if the backend JWT itself hasn't expired yet, and forces
  // a fresh login instead of silently trusting an old device.
  static const _sessionMaxAge = Duration(days: 7);

  // Save token after login — also stamps the login time for session-expiry
  // checks (see isSessionExpired/isLoggedIn below).
  static Future<void> saveToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(
      key: _loginTimeKey,
      value: DateTime.now().millisecondsSinceEpoch.toString(),
    );
  }

  // Read token for API calls
  static Future<String?> getToken() async {
    return await _storage.read(key: _tokenKey);
  }

  // Save user role (customer or salesman)
  static Future<void> saveRole(String role) async {
    await _storage.write(key: _roleKey, value: role);
  }

  // Read role for routing
  static Future<String?> getRole() async {
    return await _storage.read(key: _roleKey);
  }

  // Save the logged-in user's display name (from login/verify-otp response)
  static Future<void> saveFullName(String fullName) async {
    await _storage.write(key: _fullNameKey, value: fullName);
  }

  static Future<String?> getFullName() async {
    return await _storage.read(key: _fullNameKey);
  }

  // Save the logged-in user's own ID (needed for ledger/profile calls)
  static Future<void> saveUserId(String id) async {
    await _storage.write(key: _userIdKey, value: id);
  }

  static Future<String?> getUserId() async {
    return await _storage.read(key: _userIdKey);
  }

  static Future<void> savePhone(String phone) async {
    await _storage.write(key: _phoneKey, value: phone);
  }

  static Future<String?> getPhone() async {
    return await _storage.read(key: _phoneKey);
  }

  static Future<void> savePosition(String position) async {
    await _storage.write(key: _positionKey, value: position);
  }

  static Future<String?> getPosition() async {
    return await _storage.read(key: _positionKey);
  }

  // Clear everything on logout
  static Future<void> clearToken() async {
    await _storage.deleteAll();
  }

  // Alias — same as clearToken, named to match logout/401 call sites that
  // read more clearly as "clear everything" than "clear token".
  static Future<void> clearAll() => clearToken();

  static Future<bool> isSessionExpired() async {
    final loginTime = await _storage.read(key: _loginTimeKey);
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
