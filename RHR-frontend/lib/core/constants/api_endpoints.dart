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
  static const String salesmanLogin   = '/api/v1/auth/salesman-login';
  static const String approveCustomer = '/api/v1/auth/approve-customer/';

  // COMPANIES
  static const String companies       = '/api/v1/companies';

  // PRODUCTS
  static const String products        = '/api/v1/products';
  static const String categories      = '/api/v1/categories';

  // CUSTOMERS
  static const String customers       = '/api/v1/customers';
  static const String openingBalances = '/api/v1/opening-balances';
  static const String pendingCustomers = '/api/v1/customers/pending';
  static const String myProfile       = '/api/v1/customers/me/profile';
  static const String myShopLocation  = '/api/v1/customers/me/location';

  // SALESMEN / DRIVERS self-service profile
  static const String salesmanMyProfile = '/api/v1/salesmen/me/profile';
  static const String driverMyProfile   = '/api/v1/drivers/me/profile';

  // GEOCODING (shop-location picker search bar)
  static const String geocodeSearch = '/api/v1/geocode/search';

  // BANK ACCOUNTS (salesman Record Payment bank-transfer picker)
  static const String bankAccountsList = '/api/v1/bank/accounts/list';

  // VISITS
  static const String visits = '/api/v1/visits';

  // CASH COLLECTION (salesman recovery self-service)
  static const String recoveryTransactionsMe = '/api/v1/recovery/transactions/me';
  static const String recoveryMyCashInHand   = '/api/v1/recovery/my-cash-in-hand';
  static const String recoveryCashClosingMe  = '/api/v1/recovery/cash-closing/me';
  static const String recoveryBankTransferMe  = '/api/v1/recovery/bank-transfer/me';
  static const String recoveryChequeMe        = '/api/v1/recovery/cheque/me';
  static const String recoveryBankTransfersMe = '/api/v1/recovery/bank-transfers/me';

  // CASH COLLECTION (driver recovery self-service)
  static const String driverRecoveryTransactionsMe = '/api/v1/recovery/driver-transactions/me';
  static const String driverMyCashInHand            = '/api/v1/recovery/my-driver-cash-in-hand';
  static const String driverCashClosingMe           = '/api/v1/recovery/driver-cash-closing/me';

  // SALESMEN DIRECTORY (driver-accessible)
  static const String salesmenDirectory = '/api/v1/salesmen/directory';

  // ORDERS
  static const String orders          = '/api/v1/orders';

  // PAYMENTS
  static const String payments        = '/api/v1/payments';

  // LEDGER
  static const String ledger          = '/api/v1/ledger/';
  static const String promoBanners    = '/api/v1/promo-banners';

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
