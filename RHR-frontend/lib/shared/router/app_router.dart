import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'app_transitions.dart';
import '../../core/storage/secure_storage.dart';
import '../../features/auth/screens/splash_screen.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/otp_screen.dart';
import '../../features/auth/screens/signup_screen.dart';
import '../../features/auth/screens/pending_approval_screen.dart';
import '../../features/customer/screens/home_screen.dart';
import '../../features/customer/screens/catalogue_screen.dart';
import '../../features/customer/screens/product_detail_screen.dart';
import '../../features/customer/screens/cart_screen.dart';
import '../../features/customer/screens/order_placement_screen.dart';
import '../../features/customer/screens/order_success_screen.dart';
import '../../features/customer/screens/orders_screen.dart';
import '../../features/customer/screens/order_tracking_screen.dart';
import '../../features/customer/screens/profile_screen.dart';
import '../../features/customer/screens/ledger_screen.dart';
import '../../features/customer/screens/payment_history_screen.dart';
import '../../features/customer/screens/track_salesman_screen.dart';
import '../../features/salesman/screens/customer_map_screen.dart';
import '../../features/salesman/screens/salesman_dashboard_screen.dart';
import '../../features/salesman/screens/customers_list_screen.dart';
import '../../features/salesman/screens/customer_detail_screen.dart';
import '../../features/salesman/screens/create_order_screen.dart';
import '../../features/salesman/screens/record_payment_screen.dart';
import '../../features/salesman/screens/salesman_profile_screen.dart';
import '../../features/salesman/screens/gps_tracking_screen.dart';
import '../../features/salesman/screens/performance_screen.dart';
import '../../features/driver/screens/driver_dashboard_screen.dart';
import '../../features/driver/screens/driver_profile_screen.dart';
import '../../features/shared/screens/notifications_screen.dart';
import '../../features/hrm/screens/attendance_screen.dart';
import '../../features/hrm/screens/leave_screen.dart';
import '../../features/hrm/screens/payslip_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/splash',
  // Only guards the login screen itself: if a still-valid session exists
  // on cold start (e.g. app relaunch), skip straight past login instead of
  // making an already-authenticated user re-enter their phone/OTP. This
  // deliberately does NOT protect every other route — none of them were
  // protected before this change either, so this only adds behavior, it
  // doesn't remove any. /splash is deliberately excluded — SplashScreen
  // does its own session check after a brief branded delay, so it needs
  // to actually render instead of being redirected away instantly.
  redirect: (context, state) async {
    if (state.matchedLocation != '/login') return null;
    if (!await SecureStorage.isLoggedIn()) return null;
    final role = await SecureStorage.getRole();
    if (role == 'salesman') return '/salesman-dashboard';
    if (role == 'driver') return '/driver-dashboard';
    return '/home';
  },
  routes: [
    GoRoute(path: '/splash',           pageBuilder: (c, s) => slidePage(s, const SplashScreen())),
    GoRoute(path: '/login',            pageBuilder: (c, s) => slidePage(s, const LoginScreen())),
    GoRoute(path: '/otp',              pageBuilder: (c, s) => slidePage(s, OtpScreen(extra: s.extra))),
    GoRoute(path: '/signup',           pageBuilder: (c, s) => slidePage(s, SignupScreen(phone: s.extra as String?))),
    GoRoute(path: '/pending-approval', pageBuilder: (c, s) => slidePage(s, const PendingApprovalScreen())),
    GoRoute(path: '/home',             pageBuilder: (c, s) => slidePage(s, const HomeScreen())),
    GoRoute(path: '/catalogue',        pageBuilder: (c, s) => slidePage(s, const CatalogueScreen())),
    GoRoute(
      path: '/product-detail',
      pageBuilder: (c, s) {
        final extra = s.extra;
        Widget child;
        if (extra is String) {
          child = ProductDetailScreen(productId: extra);
        } else if (extra is Map) {
          child = ProductDetailScreen(productId: extra['id'] as String?);
        } else {
          child = const ProductDetailScreen();
        }
        return slidePage(s, child);
      },
    ),
    GoRoute(path: '/cart',                pageBuilder: (c, s) => slidePage(s, const CartScreen())),
    GoRoute(path: '/place-order',        pageBuilder: (c, s) => slidePage(s, OrderPlacementScreen(
                                             cartItems: s.extra as List<Map<String, dynamic>>?))),
    GoRoute(path: '/orders',             pageBuilder: (c, s) => slidePage(s, const OrdersScreen())),
    GoRoute(path: '/order-success',      pageBuilder: (c, s) => slidePage(s, OrderSuccessScreen(extra: s.extra))),
    GoRoute(path: '/order-tracking',     pageBuilder: (c, s) => slidePage(s, OrderTrackingScreen(orderId: s.extra as String?))),
    GoRoute(path: '/profile',            pageBuilder: (c, s) => slidePage(s, const ProfileScreen())),
    GoRoute(path: '/ledger',             pageBuilder: (c, s) => slidePage(s, const LedgerScreen())),
    GoRoute(path: '/payment-history',    pageBuilder: (c, s) => slidePage(s, const PaymentHistoryScreen())),
    GoRoute(path: '/track-salesman',     pageBuilder: (c, s) => slidePage(s, const TrackSalesmanScreen())),
    GoRoute(path: '/customer-map',       pageBuilder: (c, s) => slidePage(s, const CustomerMapScreen())),
    GoRoute(path: '/salesman-dashboard', pageBuilder: (c, s) => slidePage(s, const SalesmanDashboardScreen())),
    GoRoute(path: '/salesman-profile',   pageBuilder: (c, s) => slidePage(s, const SalesmanProfileScreen())),
    GoRoute(path: '/my-customers',       pageBuilder: (c, s) => slidePage(s, const CustomersListScreen())),
    GoRoute(path: '/customer-detail',    pageBuilder: (c, s) => slidePage(s, CustomerDetailScreen(customerId: s.extra as String?))),
    GoRoute(path: '/create-order',       pageBuilder: (c, s) => slidePage(s, const CreateOrderScreen())),
    GoRoute(path: '/record-payment',     pageBuilder: (c, s) => slidePage(s, RecordPaymentScreen(customerId: s.extra as String?))),
    GoRoute(path: '/gps-tracking',       pageBuilder: (c, s) => slidePage(s, const GpsTrackingScreen())),
    GoRoute(path: '/performance',        pageBuilder: (c, s) => slidePage(s, const PerformanceScreen())),
    GoRoute(path: '/driver-dashboard',   pageBuilder: (c, s) => slidePage(s, const DriverDashboardScreen())),
    GoRoute(path: '/driver-profile',     pageBuilder: (c, s) => slidePage(s, const DriverProfileScreen())),
    GoRoute(path: '/driver-gps-tracking', pageBuilder: (c, s) => slidePage(s, const GpsTrackingScreen(backRoute: '/driver-dashboard'))),
    GoRoute(path: '/notifications',      pageBuilder: (c, s) => slidePage(s, const NotificationsScreen())),
    GoRoute(path: '/attendance',         pageBuilder: (c, s) => slidePage(s, const AttendanceScreen())),
    GoRoute(path: '/leave',              pageBuilder: (c, s) => slidePage(s, const LeaveScreen())),
    GoRoute(path: '/payslip',            pageBuilder: (c, s) => slidePage(s, const PayslipScreen())),
  ],
);
