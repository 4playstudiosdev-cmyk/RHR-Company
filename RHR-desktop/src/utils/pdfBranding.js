// Shared header branding for every jsPDF-generated document (order
// invoices, ledger statements, etc.) — one real company logo instead of
// plain text, loaded once per session and cached. The 848KB source
// JPEG in public/assets is downscaled through a canvas before being
// embedded, since jsPDF just inlines whatever data URL it's given
// as-is — embedding the full file in every generated PDF would make
// each one needlessly large.
let logoDataUrlPromise = null;

export function loadLogoDataUrl() {
  if (logoDataUrlPromise) return logoDataUrlPromise;
  logoDataUrlPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 200;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `${process.env.PUBLIC_URL || ''}/assets/rhr-logo.jpeg`;
  });
  return logoDataUrlPromise;
}

// Draws the standard "RHR & COMPANY" header block — logo, name, tagline,
// manufacturer line, address — used identically across invoices and
// ledger statements so every exported document looks like it came from
// the same company, not a different template each time. Returns the Y
// position right below the header rule, for the caller to continue from.
export function drawPdfHeader(doc, logoDataUrl, { title, subtitle } = {}) {
  const M = 20;
  const PAGE_W = 210;

  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'JPEG', M, 10, 22, 22); } catch (e) { /* ignore */ }
  }
  const textX = logoDataUrl ? M + 28 : M;

  doc.setTextColor(20, 20, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('RHR & COMPANY', textX, 19);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(232, 132, 26);
  doc.text('THE SIGN OF QUALITY', textX, 24.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(110, 110, 110);
  doc.text('Manufacturer of: Tile Bond, Tile Grout, Readymix Plaster, Dry Wall Putty & Water Proofing Patlo', textX, 29);
  doc.text('Shop# 185-6, St 10/11 Sector G-6 K.I.A Karachi | Plot Nos. A-81-82, In SIE (Extension), Sukkur', textX, 32.5);

  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(20, 20, 30);
    doc.text(title, PAGE_W - M, 19, { align: 'right' });
  }
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(subtitle, PAGE_W - M, 25, { align: 'right' });
  }

  doc.setDrawColor(27, 46, 107);
  doc.setLineWidth(0.6);
  doc.line(M, 38, PAGE_W - M, 38);

  return 38;
}
