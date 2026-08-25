import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../shared/cart_store.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: CartStore.instance,
      builder: (context, _) {
        final cartItems = CartStore.instance.items;
        final total = CartStore.instance.total;
        return Scaffold(
          backgroundColor: AppColors.background,
          appBar: AppBar(
            backgroundColor: AppColors.primary,
            elevation: 0,
            leading: IconButton(
              icon: const Icon(Icons.arrow_back, color: Colors.white),
              onPressed: () => context.go('/catalogue'),
            ),
            title: Text('My Cart', style: AppTextStyles.headlineSm.copyWith(color: Colors.white)),
          ),
          body: cartItems.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.shopping_cart_outlined, size: 64, color: AppColors.outlineVariant),
                      const SizedBox(height: AppSpacing.base),
                      Text('Cart is empty', style: AppTextStyles.bodyMd.copyWith(color: AppColors.onSurfaceVariant)),
                      const SizedBox(height: AppSpacing.xs),
                      TextButton(
                        onPressed: () => context.go('/catalogue'),
                        child: Text('Browse Products', style: AppTextStyles.labelMd.copyWith(color: AppColors.primary)),
                      ),
                    ],
                  ),
                )
              : Column(children: [
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.all(AppSpacing.marginMobile),
                      itemCount: cartItems.length,
                      itemBuilder: (_, i) {
                        final p     = cartItems[i];
                        final pid   = p['id'] as String;
                        final qty   = p['qty'] as int;
                        final price = (p['price'] ?? 0).toDouble();
                        return Container(
                          margin: const EdgeInsets.only(bottom: AppSpacing.base),
                          padding: const EdgeInsets.all(AppSpacing.sm),
                          decoration: BoxDecoration(
                              color: AppColors.surfaceContainerLowest,
                              borderRadius: BorderRadius.circular(AppRadius.base),
                              border: Border.all(color: AppColors.outlineVariant),
                              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))]),
                          child: Row(children: [
                            Container(
                              width: 72, height: 72,
                              decoration: BoxDecoration(color: AppColors.surfaceVariant, borderRadius: BorderRadius.circular(AppRadius.base)),
                              child: p['image_url'] != null
                                  ? ClipRRect(borderRadius: BorderRadius.circular(AppRadius.base), child: Image.network(p['image_url'], fit: BoxFit.cover))
                                  : const Icon(Icons.inventory_2_outlined, color: AppColors.outline),
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(p['name'] ?? '', style: AppTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600, color: AppColors.onSurface)),
                                  const SizedBox(height: 2),
                                  Text('PKR ${price.toStringAsFixed(0)}', style: AppTextStyles.labelMd.copyWith(color: AppColors.primary)),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 4),
                              decoration: BoxDecoration(
                                  color: AppColors.surfaceContainerLow,
                                  borderRadius: BorderRadius.circular(AppRadius.base),
                                  border: Border.all(color: AppColors.outlineVariant.withValues(alpha: 0.5))),
                              child: Row(children: [
                                IconButton(
                                  onPressed: () => CartStore.instance.updateQty(pid, qty - 1),
                                  icon: const Icon(Icons.remove, size: 16),
                                  visualDensity: VisualDensity.compact,
                                ),
                                Text('$qty', style: AppTextStyles.bodySm),
                                IconButton(
                                  onPressed: () => CartStore.instance.updateQty(pid, qty + 1),
                                  icon: const Icon(Icons.add, size: 16),
                                  visualDensity: VisualDensity.compact,
                                ),
                              ]),
                            ),
                          ]),
                        );
                      },
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    decoration: const BoxDecoration(
                        color: AppColors.surfaceContainerLowest,
                        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl))),
                    child: SafeArea(
                      top: false,
                      child: Column(children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Total', style: AppTextStyles.headlineSm.copyWith(color: AppColors.onSurface)),
                            Text('PKR ${total.toStringAsFixed(0)}', style: AppTextStyles.headlineMd.copyWith(color: AppColors.primary)),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.base),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () => context.go('/place-order', extra: cartItems),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.base)),
                            ),
                            child: Text('Proceed to Checkout', style: AppTextStyles.labelMd.copyWith(color: Colors.white)),
                          ),
                        ),
                      ]),
                    ),
                  ),
                ]),
        );
      },
    );
  }
}
