import 'package:flutter/material.dart';
import '../grout_colors.dart';
import 'qty_field.dart';

/// Colour picker for a Grout product: 24 colour circles (tap one to add a set
/// of 6; tap again for another set), and below it the chosen colours, each with
/// its own quantity (− / + in sets of 6, or typed). Returns {colour name: qty}
/// for the colours with a quantity, or null if dismissed.
///
/// Used by the customer app, the salesman / driver New Order screen — the same
/// picker everywhere so every kind of order looks alike.
Future<Map<String, int>?> showGroutColorSheet(
  BuildContext context, {
  required String productName,
  required num price,
  String? unitNote,
  Map<String, int> initial = const {},
  String confirmLabel = 'Add to Cart',
}) {
  return showModalBottomSheet<Map<String, int>>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _GroutColorSheet(
      productName: productName,
      price: price,
      unitNote: unitNote,
      initial: initial,
      confirmLabel: confirmLabel,
    ),
  );
}

class _GroutColorSheet extends StatefulWidget {
  final String productName;
  final num price;
  final String? unitNote;
  final Map<String, int> initial;
  final String confirmLabel;
  const _GroutColorSheet({
    required this.productName,
    required this.price,
    required this.unitNote,
    required this.initial,
    required this.confirmLabel,
  });

  @override
  State<_GroutColorSheet> createState() => _GroutColorSheetState();
}

class _GroutColorSheetState extends State<_GroutColorSheet> {
  // insertion order = the order shown in "Aapka order"
  late final Map<String, int> _qty = {...widget.initial};

  int get _totalQty => _qty.values.fold(0, (s, v) => s + v);
  num get _total => _totalQty * widget.price;

  void _bump(String color, int delta) {
    setState(() {
      final next = (_qty[color] ?? 0) + delta;
      if (next <= 0) {
        _qty.remove(color);
      } else {
        _qty[color] = next;
      }
    });
  }

  void _set(String color, int value) {
    setState(() {
      if (value <= 0) {
        _qty.remove(color);
      } else {
        _qty[color] = value;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: DraggableScrollableSheet(
        initialChildSize: 0.92,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scroll) => Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(children: [
            Container(
              margin: const EdgeInsets.symmetric(vertical: 10),
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(2)),
            ),
            Expanded(
              child: ListView(
                controller: scroll,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                children: [
                  Text(widget.productName, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 2),
                  Text('PKR ${widget.price.toStringAsFixed(0)} per packet${widget.unitNote != null ? ' · ${widget.unitNote}' : ''}',
                      style: const TextStyle(color: Colors.black54, fontSize: 12.5)),
                  const SizedBox(height: 6),
                  Row(children: [
                    const Icon(Icons.info_outline, size: 15, color: Color(0xFF0E9F8E)),
                    const SizedBox(width: 6),
                    Text('Har rang $kGroutStep packet ke set mein',
                        style: const TextStyle(color: Color(0xFF0E9F8E), fontSize: 12.5, fontWeight: FontWeight.w600)),
                  ]),
                  const SizedBox(height: 14),
                  Text('RANG CHUNEIN (${kGroutColors.length} colours)',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.black54, letterSpacing: 0.4)),
                  const SizedBox(height: 10),
                  GridView.count(
                    crossAxisCount: 6,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 4,
                    childAspectRatio: 0.72,
                    children: [for (final c in kGroutColors) _swatch(c)],
                  ),
                  const SizedBox(height: 16),
                  Text('AAPKA ORDER (${_qty.length} RANG)',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.black54, letterSpacing: 0.4)),
                  const SizedBox(height: 8),
                  if (_qty.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Center(child: Text('Upar se rang chunein', style: TextStyle(color: Colors.black45))),
                    )
                  else
                    ..._qty.entries.map((e) => _line(e.key, e.value)),
                ],
              ),
            ),
            Container(
              padding: EdgeInsets.fromLTRB(16, 10, 16, 14 + MediaQuery.of(context).padding.bottom),
              decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Color(0x14000000)))),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                    const Text('TOTAL', style: TextStyle(fontSize: 11, color: Colors.black45, fontWeight: FontWeight.w700)),
                    Text('$_totalQty packets · PKR ${_total.toStringAsFixed(0)}',
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                  ]),
                ),
                ElevatedButton.icon(
                  onPressed: () => Navigator.pop(context, Map<String, int>.from(_qty)),
                  icon: const Icon(Icons.shopping_bag_outlined, size: 18),
                  label: Text(widget.confirmLabel),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0E9F8E),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _swatch(GroutColor c) {
    final q = _qty[c.name] ?? 0;
    final selected = q > 0;
    return GestureDetector(
      onTap: () => _bump(c.name, kGroutStep),
      behavior: HitTestBehavior.opaque,
      child: Column(children: [
        Stack(clipBehavior: Clip.none, children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: c.color,
              shape: BoxShape.circle,
              border: Border.all(
                color: selected ? const Color(0xFF0E9F8E) : Colors.black12,
                width: selected ? 3 : 1,
              ),
            ),
          ),
          if (selected)
            Positioned(
              right: -6,
              top: -6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                constraints: const BoxConstraints(minWidth: 20),
                decoration: BoxDecoration(color: const Color(0xFF111827), borderRadius: BorderRadius.circular(10)),
                child: Text('$q', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.bold)),
              ),
            ),
        ]),
        const SizedBox(height: 4),
        Text(c.name,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 9.5, height: 1.1, color: selected ? Colors.black87 : Colors.black54, fontWeight: selected ? FontWeight.w700 : FontWeight.w500)),
      ]),
    );
  }

  Widget _line(String color, int qty) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: const Color(0xFFF7F8FA), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0x0F000000))),
      child: Row(children: [
        Container(width: 26, height: 26, decoration: BoxDecoration(color: groutColorFor(color), shape: BoxShape.circle, border: Border.all(color: Colors.black12))),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(color, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            Text('PKR ${(qty * widget.price).toStringAsFixed(0)}', style: const TextStyle(color: Colors.black45, fontSize: 12)),
          ]),
        ),
        IconButton(
          visualDensity: VisualDensity.compact,
          onPressed: () => _bump(color, -kGroutStep),
          icon: const Icon(Icons.remove_circle_outline),
        ),
        QtyField(
          key: ValueKey(color),
          value: qty,
          width: 44,
          onChanged: (v) => _set(color, v),
        ),
        IconButton(
          visualDensity: VisualDensity.compact,
          onPressed: () => _bump(color, kGroutStep),
          icon: const Icon(Icons.add_circle_outline),
        ),
      ]),
    );
  }
}
