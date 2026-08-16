import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  static const _storage = FlutterSecureStorage();
  static const _tokenKey    = 'jwt_token';
  static const _roleKey     = 'user_role';
  static const _fullNameKey = 'user_full_name';
  static const _userIdKey   = 'user_id';
  static const _phoneKey    = 'user_phone';
  static const _positionKey = 'user_position';

  // Save token after login
  static Future<void> saveToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
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
}
