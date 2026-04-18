"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/tz";

type InvoiceItem = { id: string; description: string; quantity: number; unitPrice: number; lineTotal: number };
type Invoice = {
  id: string; invoiceNo: string;
  customerId: string; customerName: string;
  stylistId?: string; stylistName?: string;
  issuedAtUtc: string; dueAtUtc?: string;
  status: string; currency: string;
  subtotal: number; taxRate: number; taxAmount: number; total: number;
  notes?: string; createdAtUtc: string;
  items: InvoiceItem[];
};
type Customer = { id: string; firstName: string; lastName: string };
type Stylist  = { id: string; fullName: string };
type Summary  = { totalRevenue: number; outstanding: number; thisMonthTotal: number; overdueCount: number };

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  Draft:     { label: "Taslak",     color: "#667085", bg: "#f2f4f7" },
  Sent:      { label: "Gönderildi", color: "#1d4ed8", bg: "#eff8ff" },
  Paid:      { label: "Ödendi",     color: "#059669", bg: "#f0fdf4" },
  Overdue:   { label: "Gecikmiş",   color: "#b42318", bg: "#fef3f2" },
  Cancelled: { label: "İptal",      color: "#92400e", bg: "#fffbeb" },
};
const STATUSES   = ["Draft","Sent","Paid","Overdue","Cancelled"];
const CURRENCIES = ["TRY","USD","EUR"];
const TAX_RATES  = [0, 10, 20];

function fmt(n: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(n);
}

const card: React.CSSProperties = {
  background: "var(--surface, #fff)", border: "1px solid #eaecf0",
  borderRadius: 20, padding: 24, boxShadow: "0 1px 4px rgba(16,24,40,0.06)",
};

export default function FinancePage() {
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [summary, setSummary]     = useState<Summary | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stylists, setStylists]   = useState<Stylist[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm]   = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const PAGE_SIZE = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (filterStatus) qs.set("status", filterStatus);
      const [invRes, sumRes] = await Promise.all([
        apiFetch(`/Invoices?${qs}`),
        apiFetch("/Invoices/summary"),
      ]);
      if (invRes.ok) { const d = await invRes.json(); setInvoices(d.items ?? []); setTotal(d.total ?? 0); }
      if (sumRes.ok) setSummary(await sumRes.json());
    } finally { setLoading(false); }
  }, [page, filterStatus]);

  useEffect(() => {
    apiFetch("/Customers?pageSize=200").then(r => r.ok ? r.json() : null).then(d => {
      if (Array.isArray(d)) setCustomers(d);
      else if (d?.items) setCustomers(d.items);
    });
    apiFetch("/Stylists").then(r => r.ok ? r.json() : null).then(d => {
      if (Array.isArray(d)) setStylists(d);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteInvoice = async (id: string) => {
    if (!confirm("Bu faturayı silmek istediğinize emin misiniz?")) return;
    await apiFetch(`/Invoices/${id}`, { method: "DELETE" });
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    await apiFetch(`/Invoices/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AppShell title="Finans & Faturalama" description="Fatura yönetimi ve gelir takibi">
      {/* Özet kartları */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Toplam Gelir",     value: fmt(summary.totalRevenue),       icon: "💰", color: "#059669" },
            { label: "Bu Ay",            value: fmt(summary.thisMonthTotal),      icon: "📅", color: "#7c3aed" },
            { label: "Bekleyen",         value: fmt(summary.outstanding),         icon: "⏳", color: "#d97706" },
            { label: "Gecikmiş Fatura",  value: String(summary.overdueCount),    icon: "⚠️", color: "#b42318" },
          ].map(s => (
            <div key={s.label} style={{ ...card, display: "flex", alignItems: "center", gap: 16, padding: "18px 20px" }}>
              <div style={{ fontSize: 28 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <select
          value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 13 }}
        >
          <option value="">Tüm Durumlar</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s]?.label ?? s}</option>)}
        </select>
        <button
          onClick={() => { setEditInvoice(null); setShowForm(true); }}
          style={{ marginLeft: "auto", padding: "9px 18px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
        >+ Yeni Fatura</button>
      </div>

      {/* Tablo */}
      <div style={card}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Yükleniyor…</div>
        ) : invoices.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Fatura bulunamadı.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #eaecf0" }}>
                  {["Fatura No","Müşteri","Stilist","Tarih","Vade","Tutar","Durum",""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#667085", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const meta = STATUS_META[inv.status] ?? { label: inv.status, color: "#667085", bg: "#f2f4f7" };
                  return (
                    <tr key={inv.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{inv.invoiceNo}</td>
                      <td style={{ padding: "10px 12px" }}>{inv.customerName}</td>
                      <td style={{ padding: "10px 12px", color: "#64748b" }}>{inv.stylistName ?? "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(inv.issuedAtUtc)}</td>
                      <td style={{ padding: "10px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{inv.dueAtUtc ? fmtDate(inv.dueAtUtc) : "—"}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>{fmt(inv.total, inv.currency)}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, color: meta.color, background: meta.bg }}>{meta.label}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { setEditInvoice(inv); setShowForm(true); }}
                            style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #e4e7ec", cursor: "pointer", background: "#fff" }}>Düzenle</button>
                          <select value="" onChange={e => updateStatus(inv.id, e.target.value)}
                            style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid #e4e7ec", cursor: "pointer" }}>
                            <option value="">Durum</option>
                            {STATUSES.filter(s => s !== inv.status).map(s => <option key={s} value={s}>{STATUS_META[s]?.label}</option>)}
                          </select>
                          <button onClick={() => deleteInvoice(inv.id)}
                            style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #fca5a5", color: "#b42318", cursor: "pointer", background: "#fff" }}>Sil</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Sayfalama */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e4e7ec", cursor: "pointer", background: p === page ? "#7c3aed" : "#fff", color: p === page ? "#fff" : "#374151", fontWeight: p === page ? 700 : 400 }}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <InvoiceForm
          invoice={editInvoice}
          customers={customers}
          stylists={stylists}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </AppShell>
  );
}

function InvoiceForm({ invoice, customers, stylists, onClose, onSaved }: {
  invoice: Invoice | null;
  customers: Customer[];
  stylists: Stylist[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!invoice;
  const [customerId, setCustomerId] = useState(invoice?.customerId ?? "");
  const [stylistId, setStylistId]   = useState(invoice?.stylistId ?? "");
  const [status, setStatus]         = useState(invoice?.status ?? "Draft");
  const [currency, setCurrency]     = useState(invoice?.currency ?? "TRY");
  const [taxRate, setTaxRate]       = useState(invoice?.taxRate ?? 0);
  const [notes, setNotes]           = useState(invoice?.notes ?? "");
  const [items, setItems]           = useState<{ description: string; quantity: number; unitPrice: number }[]>(
    invoice?.items?.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })) ?? [{ description: "", quantity: 1, unitPrice: 0 }]
  );
  const [saving, setSaving] = useState(false);

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmt   = Math.round(subtotal * taxRate / 100 * 100) / 100;
  const total    = subtotal + taxAmt;

  const save = async () => {
    if (!customerId) { alert("Müşteri seçiniz."); return; }
    setSaving(true);
    const body = { customerId, stylistId: stylistId || undefined, status, currency, taxRate, notes, items };
    const res = isEdit
      ? await apiFetch(`/Invoices/${invoice!.id}`, { method: "PUT", body: JSON.stringify(body) })
      : await apiFetch("/Invoices", { method: "POST", body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) onSaved();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 32, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 700 }}>{isEdit ? "Fatura Düzenle" : "Yeni Fatura"}</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Müşteri *</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 13 }}>
              <option value="">Seçiniz</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Stilist</label>
            <select value={stylistId} onChange={e => setStylistId(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 13 }}>
              <option value="">Seçiniz</option>
              {stylists.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Durum</label>
            <select value={status} onChange={e => setStatus(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 13 }}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s]?.label ?? s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Para Birimi</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 13 }}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>KDV %</label>
            <select value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 13 }}>
              {TAX_RATES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {/* Kalemler */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Kalemler</div>
          {items.map((item, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px 32px", gap: 8, marginBottom: 8 }}>
              <input value={item.description} onChange={e => { const n = [...items]; n[i].description = e.target.value; setItems(n); }}
                placeholder="Açıklama" style={{ padding: "8px 10px", borderRadius: 7, border: "1px solid #d0d5dd", fontSize: 13 }} />
              <input type="number" value={item.quantity} min={1} onChange={e => { const n = [...items]; n[i].quantity = Number(e.target.value); setItems(n); }}
                style={{ padding: "8px 10px", borderRadius: 7, border: "1px solid #d0d5dd", fontSize: 13 }} />
              <input type="number" value={item.unitPrice} min={0} step={0.01} onChange={e => { const n = [...items]; n[i].unitPrice = Number(e.target.value); setItems(n); }}
                placeholder="Birim fiyat" style={{ padding: "8px 10px", borderRadius: 7, border: "1px solid #d0d5dd", fontSize: 13 }} />
              <button onClick={() => setItems(items.filter((_, j) => j !== i))}
                style={{ borderRadius: 7, border: "1px solid #fca5a5", color: "#b42318", background: "#fff", cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
          ))}
          <button onClick={() => setItems([...items, { description: "", quantity: 1, unitPrice: 0 }])}
            style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "1px dashed #d0d5dd", cursor: "pointer", background: "#f9fafb", marginTop: 4 }}>+ Kalem Ekle</button>
        </div>

        {/* Notlar */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Notlar</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
        </div>

        {/* Özet */}
        <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span>Ara toplam</span><span>{fmt(subtotal, currency)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span>KDV %{taxRate}</span><span>{fmt(taxAmt, currency)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid #e4e7ec", paddingTop: 8, marginTop: 4 }}><span>Toplam</span><span>{fmt(total, currency)}</span></div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #d0d5dd", background: "#fff", cursor: "pointer", fontSize: 13 }}>İptal</button>
          <button onClick={save} disabled={saving}
            style={{ padding: "10px 20px", borderRadius: 10, background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
