/// Single source of truth for Pakistani phone number formatting — the same
/// logic used to be copy-pasted with subtle variations across login,
/// signup, and OTP screens. The backend stores/looks up phone numbers in
/// local '0xxxxxxxxx' format (not the international '92xxxxxxxxxx' form),
/// so that's what [normalize] must produce — always call it before sending
/// a phone to the API.
class PhoneNormalizer {
  /// '+92 312 3456789', '923123456789', '0312-3456789' -> '03123456789'
  static String normalize(String raw) {
    String cleaned = raw.replaceAll(RegExp(r'[\s\-\(\)]'), '').trim();
    if (cleaned.startsWith('+92')) cleaned = '0${cleaned.substring(3)}';
    if (cleaned.startsWith('92') && cleaned.length == 12) {
      cleaned = '0${cleaned.substring(2)}';
    }
    if (!cleaned.startsWith('0')) cleaned = '0$cleaned';
    return cleaned;
  }
}
