class ApiEndpoints {
  // ── BACKEND CONNECTION ──
  // Production backend (Railway) — used by default so the app works for any
  // real phone without needing the dev machine on the same network. For
  // local backend testing, comment this out and uncomment one of the LAN
  // lines below instead.

  static const String baseUrl = 'https://rhr-company-production.up.railway.app';
  // static const String baseUrl = 'http://localhost:3000';        // Web / Windows desktop, local backend
  // static const String baseUrl = 'http://10.0.2.2:3000';         // Android emulator (maps to host's localhost)
  // static const String baseUrl = 'http://192.168.0.95:3000';     // Physical device on same WiFi — update to your PC's LAN IP

  // AUTH
  static const String sendOtp         = '/api/v1/auth/send-otp';
  static const String verifyOtp       = '/api/v1/auth/verify-otp';
  static const String login           = '/api/v1/auth/login';
  static const String approveCustomer = '/api/v1/auth/approve-customer/';
  static const String whatsappStatus  = '/api/v1/auth/whatsapp-status';

  // COMPANIES
  static const String companies       = '/api/v1/companies';

  // PRODUCTS
  static const String products        = '/api/v1/products';

  // CUSTOMERS
  static const String customers       = '/api/v1/customers';
  static const String pendingCustomers = '/api/v1/customers/pending';

  // ORDERS
  static const String orders          = '/api/v1/orders';

  // PAYMENTS
  static const String payments        = '/api/v1/payments';

  // LEDGER
  static const String ledger          = '/api/v1/ledger/';

  // STORAGE
  static const String storageUpload   = '/api/v1/storage/upload';
  static const String storageSignedUrl = '/api/v1/storage/signed-url';

  // INVOICES
  static const String invoiceDownload = '/api/v1/invoices/download/';

  // COMPANY IDs
  static const String khiId = '1e5962c6-33a7-460b-913e-9e08db46973a';
  static const String hydId = '09a1fda3-7ac0-406a-8f42-75d973dc3b7e';
  static const String sukId = '00f79d89-0d36-4704-8865-fc7bbd662267';
}
