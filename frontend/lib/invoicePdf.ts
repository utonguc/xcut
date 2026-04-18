/**
 * Invoice PDF generation using jsPDF + jsPDF-autotable.
 */

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceData {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  issueDate: string;
  dueDate?: string;
  lines: InvoiceLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  salonName: string;
  salonAddress?: string;
  salonPhone?: string;
}

export async function downloadInvoicePdf(invoice: InvoiceData): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const primary = [124, 58, 237]; // #7c3aed
  const PAGE_W = 210;
  const MARGIN = 20;

  // Header band
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(0, 0, PAGE_W, 32, "F");

  // Salon name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(invoice.salonName, MARGIN, 14);

  // "FATURA" label
  doc.setFontSize(22);
  doc.text("FATURA", PAGE_W - MARGIN, 14, { align: "right" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  if (invoice.salonAddress) doc.text(invoice.salonAddress, MARGIN, 20);
  if (invoice.salonPhone) doc.text(invoice.salonPhone, MARGIN, 25);
  doc.text(`# ${invoice.invoiceNumber}`, PAGE_W - MARGIN, 22, { align: "right" });
  doc.text(`Tarih: ${invoice.issueDate}`, PAGE_W - MARGIN, 27, { align: "right" });

  // Customer block
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Fatura Kesilen:", MARGIN, 45);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.customerName, MARGIN, 51);
  if (invoice.customerEmail) doc.text(invoice.customerEmail, MARGIN, 57);
  if (invoice.customerPhone) doc.text(invoice.customerPhone, MARGIN, 63);

  // Line items table
  autoTable(doc, {
    startY: 72,
    head: [["Açıklama", "Adet", "Birim Fiyat", "Toplam"]],
    body: invoice.lines.map(l => [
      l.description,
      l.quantity,
      `₺${l.unitPrice.toFixed(2)}`,
      `₺${l.total.toFixed(2)}`,
    ]),
    theme: "striped",
    headStyles: {
      fillColor: primary as [number, number, number],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 20, halign: "center" },
      2: { cellWidth: 35, halign: "right" },
      3: { cellWidth: 35, halign: "right" },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  // Totals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY + 8;

  const col2X = PAGE_W - MARGIN;
  const col1X = col2X - 45;

  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text("Ara Toplam:", col1X, finalY, { align: "right" });
  doc.text(`₺${invoice.subtotal.toFixed(2)}`, col2X, finalY, { align: "right" });

  doc.text(`KDV (%${invoice.taxRate}):`, col1X, finalY + 6, { align: "right" });
  doc.text(`₺${invoice.taxAmount.toFixed(2)}`, col2X, finalY + 6, { align: "right" });

  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(col1X - 40, finalY + 10, 40 + 45 + MARGIN, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("GENEL TOPLAM:", col1X, finalY + 16, { align: "right" });
  doc.text(`₺${invoice.totalAmount.toFixed(2)}`, col2X, finalY + 16, { align: "right" });

  // Notes
  if (invoice.notes) {
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Notlar:", MARGIN, finalY + 30);
    doc.text(invoice.notes, MARGIN, finalY + 36, { maxWidth: 120 });
  }

  doc.save(`fatura-${invoice.invoiceNumber}.pdf`);
}
