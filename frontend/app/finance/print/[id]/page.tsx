"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, API_BASE_URL } from "@/lib/api";

type InvoiceItem = { id: string; description: string; quantity: number; unitPrice: number; lineTotal: number };
type Invoice = {
  id: string; invoiceNo: string; customerId?: string; customerName?: string;
  stylistName?: string; issuedAtUtc: string; dueAtUtc?: string; status: string;
  currency: string; subtotal: number; taxRate: number; taxAmount: number; total: number;
  notes?: string; createdAtUtc: string; items: InvoiceItem[];
};
type OrgSettings = { companyName: string; logoUrl?: string };
type SalonInfo   = { salonName?: string; city?: string };

const STATUS_TR: Record<string, string> = {
  Draft: "Taslak", Sent: "Gönderildi", Paid: "Ödendi", Overdue: "Gecikmiş", Cancelled: "İptal",
};

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [org,     setOrg]     = useState<OrgSettings | null>(null);
  const [salon,   setSalon]   = useState<SalonInfo | null>(null);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch(`/Invoices/${id}`).then(r => r.ok ? r.json() : null),
      apiFetch("/Settings/organization").then(r => r.ok ? r.json() : null),
      apiFetch("/Auth/me").then(r => r.ok ? r.json() : null),
    ]).then(([inv, o, me]) => {
      if (!inv) { setError(true); return; }
      setInvoice(inv);
      setOrg(o);
      setSalon({ salonName: me?.salonName, city: me?.city });
    });
  }, [id]);

  useEffect(() => {
    if (invoice) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [invoice]);

  if (error) return <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>Fatura bulunamadı.</div>;
  if (!invoice) return <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>Yükleniyor...</div>;

  const logoSrc = org?.logoUrl ? `${API_BASE_URL.replace("/api", "")}${org.logoUrl}` : null;
  const companyName = org?.companyName ?? salon?.salonName ?? "Salon";
  const issuedDate = new Date(invoice.issuedAtUtc).toLocaleDateString("tr-TR");
  const fmtMoney = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2 });

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #111; background: #fff; }
        @page { size: A4; margin: 14mm 16mm; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        table { border-collapse: collapse; width: 100%; }
        th, td { padding: 8px 10px; }
        th { background: #f3f4f6; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        tr:nth-child(even) td { background: #fafafa; }
        .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
      `}</style>

      {/* Print button — hidden when printing */}
      <div className="no-print" style={{ background: "#1d4ed8", padding: "10px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => window.print()} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#fff", color: "#1d4ed8", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          🖨 Yazdır / PDF
        </button>
        <span style={{ color: "#fff", fontSize: 13 }}>{companyName} — {invoice.invoiceNo}</span>
      </div>

      <div style={{ maxWidth: 740, margin: "0 auto", padding: "24px 0" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            {logoSrc ? (
              <img src={logoSrc} alt="Logo" style={{ maxHeight: 60, maxWidth: 180, marginBottom: 8 }} />
            ) : (
              <div style={{ fontSize: 22, fontWeight: 900, color: "#1d4ed8", marginBottom: 4 }}>{companyName}</div>
            )}
            {salon?.city && <div style={{ fontSize: 12, color: "#6b7280" }}>{salon.city}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#111", marginBottom: 4 }}>FATURA</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1d4ed8" }}>{invoice.invoiceNo}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Tarih: {issuedDate}</div>
            {invoice.dueAtUtc && (
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Vade: {new Date(invoice.dueAtUtc).toLocaleDateString("tr-TR")}
              </div>
            )}
            <div style={{ marginTop: 6 }}>
              <span className="badge" style={{
                background: invoice.status === "Paid" ? "#dcfce7" : invoice.status === "Overdue" ? "#fee2e2" : "#fef3c7",
                color:      invoice.status === "Paid" ? "#166534" : invoice.status === "Overdue" ? "#991b1b" : "#92400e",
              }}>
                {STATUS_TR[invoice.status] ?? invoice.status}
              </span>
            </div>
          </div>
        </div>

        {/* Bill to */}
        {invoice.customerName && (
          <div style={{ marginBottom: 28, padding: "12px 16px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Fatura Kesilen</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{invoice.customerName}</div>
            {invoice.stylistName && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Uzman: {invoice.stylistName}</div>}
          </div>
        )}

        {/* Items table */}
        <table style={{ marginBottom: 20, border: "1px solid #e5e7eb" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Hizmet / Ürün</th>
              <th style={{ textAlign: "center", width: 70 }}>Adet</th>
              <th style={{ textAlign: "right", width: 110 }}>Birim Fiyat</th>
              <th style={{ textAlign: "right", width: 110 }}>Tutar</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map(item => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td style={{ textAlign: "center" }}>{item.quantity}</td>
                <td style={{ textAlign: "right" }}>₺{fmtMoney(item.unitPrice)}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>₺{fmtMoney(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 28 }}>
          <div style={{ width: 260 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
              <span style={{ color: "#6b7280" }}>Ara Toplam</span>
              <span>₺{fmtMoney(invoice.subtotal)}</span>
            </div>
            {invoice.taxRate > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                <span style={{ color: "#6b7280" }}>KDV (%{invoice.taxRate})</span>
                <span>₺{fmtMoney(invoice.taxAmount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 900, fontSize: 16, borderTop: "2px solid #111", marginTop: 2 }}>
              <span>TOPLAM</span>
              <span style={{ color: "#1d4ed8" }}>₺{fmtMoney(invoice.total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div style={{ padding: "10px 14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12, color: "#6b7280", marginBottom: 24 }}>
            <strong>Not:</strong> {invoice.notes}
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
          {companyName} — Bu belge {new Date(invoice.createdAtUtc).toLocaleDateString("tr-TR")} tarihinde oluşturulmuştur.
        </div>
      </div>
    </>
  );
}
