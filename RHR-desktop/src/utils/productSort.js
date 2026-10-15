// Mirrors the backend's identical list in
// products.service.js#sortByMerchandisingOrder — keep both in sync.
// Fixed merchandising order every product listing should lead with, top
// sellers first, each product's own weight variants (e.g. Patlo Sealer
// 1KG/2KG/5KG/10KG) immediately following it. Anything not listed here
// keeps its existing relative order, appended after everything that is.
const PRODUCT_PRIORITY_PREFIXES = [
  'readymix tile bond 150%',
  'readicam tile bond',
  'stylo plus tile bond',
  'total tile bond',
  'tile stone bond',
  'super sonex tile bond',
  'sani star tile bond',
  'super stylo tile bond',
  'easy fix tile bond',
  'strong hi-mix bond',
  'new stylish grout',
  'total tile grout',
  'strong hi-mix grout',
  'aqua shield',
  'readymix patlo',
  'patlo sealer',
  'mapro white cement',
  'mapro gray cement',
  'plaster of paris',
];

export function sortByMerchandisingOrder(products) {
  const indexed = products.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => {
    const nameA = (a.p.name || '').toLowerCase();
    const nameB = (b.p.name || '').toLowerCase();
    const prioA = PRODUCT_PRIORITY_PREFIXES.findIndex((prefix) => nameA.startsWith(prefix));
    const prioB = PRODUCT_PRIORITY_PREFIXES.findIndex((prefix) => nameB.startsWith(prefix));
    const rankA = prioA === -1 ? PRODUCT_PRIORITY_PREFIXES.length : prioA;
    const rankB = prioB === -1 ? PRODUCT_PRIORITY_PREFIXES.length : prioB;
    if (rankA !== rankB) return rankA - rankB;
    if (rankA === PRODUCT_PRIORITY_PREFIXES.length) return a.i - b.i;
    const weightA = parseInt((nameA.match(/(\d+)\s*kg/) || [])[1], 10) || 0;
    const weightB = parseInt((nameB.match(/(\d+)\s*kg/) || [])[1], 10) || 0;
    if (weightA !== weightB) return weightA - weightB;
    return a.i - b.i;
  });
  return indexed.map((x) => x.p);
}
