// How a customer is named in dropdowns and lists: the SHOP name first (that is what
// everyone knows them by), with the owner's own name after it — "Karamawalla hardware — Abdul ghani".
// A customer without a shop name just shows their own name.
export function customerLabel(c) {
  if (!c) return '';
  const shop = (c.shop_name || '').trim();
  const owner = (c.full_name || '').trim();
  if (shop && owner && shop.toLowerCase() !== owner.toLowerCase()) return shop + ' — ' + owner;
  return shop || owner;
}
