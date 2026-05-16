"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

/* ── Types ─────────────────────────────────────────────────────────── */
type TxItem  = { id: string; stylistName?: string; customerName?: string; total: number; cashAmount: number; cardAmount: number; bankAmount: number; paymentMethod: string; status: string; createdAtUtc: string; itemCount: number };
type TxDetail= TxItem & { subtotal: number; discountType: string; discountValue: number; discountAmount: number; salonName?: string; items: { name: string; unitPrice: number; quantity: number; lineTotal: number }[] };
type Bucket  = { label: string; revenue: number; cash: number; card: number; bank: number; count: number };
type Summary = { totalRevenue: number; totalCash: number; totalCard: number; totalBank: number; totalExpenses: number; txCount: number; buckets: Bucket[] };
type Paged<T>= { items: T[]; total: number; page: number; pageSize: number };
type CommRow = { stylistId: string; stylistName: string; payType: string; commissionRate: number; fixedSalary: number; revenue: number; commission: number; txCount: number };
type ServiceItem = { name: string; count: number; revenue: number; avgPrice: number };
type CustomerAnalytics = { newCustomerCount: number; returningCustomerCount: number; topCustomers: { name: string; visits: number; spent: number }[] };
type HourlyBucket = { hour: number; count: number; revenue: number };
type StylistPerf   = { name: string; txCount: number; revenue: number; avgTicket: number; customerCount: number };
type AppointmentAnalytics = { total: number; completed: number; cancelled: number; noShow: number; scheduled: number; completionRate: number; byStylist: { name: string; total: number; completed: number; cancelled: number }[] };
type PaymentBreakdown = { method: string; count: number; amount: number; pct: number };
type ExpenseItem      = { category: string; count: number; amount: number };
type ScheduledReport  = { id: string; name: string; reportType: string; reportTypeLabel: string; frequency: string; sendHour: number; recipientEmails?: string; filtersJson?: string; isActive: boolean; lastSentAtUtc?: string; nextRunAtUtc?: string; createdAtUtc: string };

const fmt  = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toFixed(0);
const PAY_LABELS: Record<string, string> = { cash: "💵 Nakit", card: "💳 Kart", mixed: "↔ Karma", bank: "🏦 Havale" };
const PAY_TYPE_LABELS: Record<string, string> = { commission: "Prim", fixed_monthly: "Aylık Sabit", fixed_weekly: "Haftalık Sabit", fixed_daily: "Günlük" };
const FREQ_LABELS: Record<string, string> = { once: "Tek Seferlik", daily: "Günlük", weekly: "Haftalık", monthly: "Aylık" };

const REPORT_TYPES = [
  { value: "revenue",      label: "Gelir Özeti" },
  { value: "services",     label: "Hizmet Analizi" },
  { value: "customers",    label: "Müşteri Analizi" },
  { value: "stylists",     label: "Stilist Performansı" },
  { value: "appointments", label: "Randevu Raporu" },
  { value: "payments",     label: "Ödeme Analizi" },
  { value: "expenses",     label: "Masraf Raporu" },
  { value: "full",         label: "Tam Rapor" },
];

const PERIODS = [
  { value: "today", label: "Bugün" },
  { value: "week",  label: "Bu Hafta" },
  { value: "month", label: "Bu Ay" },
  { value: "year",  label: "Bu Yıl" },
] as const;
type PeriodKey = "today" | "week" | "month" | "year";

const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: i, label: `${String(i).padStart(2,"0")}:00` }));

/* ── Main page ──────────────────────────────────────────────────────── */
export default function RaporlarPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"ozet" | "analiz" | "raporlarim">("ozet");
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txs,     setTxs]     = useState<TxItem[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage,  setTxPage]  = useState(1);
  const [txLoading, setTxLoading] = useState(false);
  const [receipt, setReceipt] = useState<TxDetail | null>(null);
  const [commissions, setCommissions] = useState<CommRow[]>([]);
  const [subTab, setSubTab] = useState<"genel" | "stilist">("genel");
  const printRef = useRef<HTMLDivElement>(null);

  // Analytics
  const [services,      setServices]      = useState<ServiceItem[]>([]);
  const [custAnalytics, setCustAnalytics] = useState<CustomerAnalytics | null>(null);
  const [hourly,        setHourly]        = useState<HourlyBucket[]>([]);
  const [stylistPerf,   setStylistPerf]   = useState<StylistPerf[]>([]);
  const [apptAnalytics, setApptAnalytics] = useState<AppointmentAnalytics | null>(null);
  const [payments,      setPayments]      = useState<PaymentBreakdown[]>([]);
  const [expenses,      setExpenses]      = useState<ExpenseItem[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Scheduled
  const [scheduled,   setScheduled]   = useState<ScheduledReport[]>([]);
  const [wizardOpen,  setWizardOpen]  = useState(false);
  const [editTarget,  setEditTarget]  = useState<ScheduledReport | null>(null);

  // ── Load data ───────────────────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    const [r, cr] = await Promise.all([
      apiFetch(`/Reports/summary?period=${period}`),
      apiFetch(`/Reports/commissions?period=${period}`),
    ]);
    if (r.ok)  setSummary(await r.json());
    if (cr.ok) setCommissions(await cr.json());
  }, [period]);

  const loadTxs = useCallback(async (p: number) => {
    setTxLoading(true);
    const now = new Date();
    let from: Date, to: Date;
    if (period === "today") { from = new Date(now); from.setHours(0,0,0,0); to = new Date(); }
    else if (period === "week") { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); d.setHours(0,0,0,0); from = d; to = new Date(); }
    else if (period === "year") { from = new Date(now.getFullYear(), 0, 1); to = new Date(); }
    else { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(); }

    const r = await apiFetch(`/Reports/transactions?from=${from.toISOString()}&to=${to.toISOString()}&page=${p}&pageSize=30`);
    if (r.ok) {
      const d: Paged<TxItem> = await r.json();
      setTxs(d.items); setTxTotal(d.total);
    }
    setTxLoading(false);
  }, [period]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    const [sr, cr, hr, pr, ar, payr, expr] = await Promise.all([
      apiFetch(`/Reports/analytics/services?period=${period}`),
      apiFetch(`/Reports/analytics/customers?period=${period}`),
      apiFetch(`/Reports/analytics/hourly?period=${period}`),
      apiFetch(`/Reports/analytics/stylists?period=${period}`),
      apiFetch(`/Reports/analytics/appointments?period=${period}`),
      apiFetch(`/Reports/analytics/payments?period=${period}`),
      apiFetch(`/Reports/analytics/expenses?period=${period}`),
    ]);
    if (sr.ok)   setServices(await sr.json());
    if (cr.ok)   setCustAnalytics(await cr.json());
    if (hr.ok)   setHourly(await hr.json());
    if (pr.ok)   setStylistPerf(await pr.json());
    if (ar.ok)   setApptAnalytics(await ar.json());
    if (payr.ok) setPayments(await payr.json());
    if (expr.ok) setExpenses(await expr.json());
    setAnalyticsLoading(false);
  }, [period]);

  const loadScheduled = useCallback(async () => {
    const r = await apiFetch("/Reports/scheduled");
    if (r.ok) setScheduled(await r.json());
  }, []);

  useEffect(() => { setTxPage(1); loadSummary(); }, [loadSummary]);
  useEffect(() => { loadTxs(txPage); }, [loadTxs, txPage]);
  useEffect(() => { if (tab === "analiz") loadAnalytics(); }, [tab, loadAnalytics]);
  useEffect(() => { if (tab === "raporlarim") loadScheduled(); }, [tab, loadScheduled]);

  const openReceipt = async (id: string) => {
    const r = await apiFetch(`/Reports/transactions/${id}`);
    if (r.ok) setReceipt(await r.json());
  };

  const printReceipt = () => {
    if (!printRef.current) return;
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`<html><head><title>Fiş</title><style>body{font-family:monospace;font-size:13px;padding:16px;max-width:340px;margin:0 auto}td{padding:2px 4px}.right{text-align:right}table{width:100%}</style></head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close(); w.focus(); w.print(); w.close();
  };

  const deleteScheduled = async (id: string) => {
    const r = await apiFetch(`/Reports/scheduled/${id}`, { method: "DELETE" });
    if (r.ok) { setScheduled(s => s.filter(x => x.id !== id)); toast.success("Rapor silindi"); }
    else toast.error("Silinemedi");
  };

  const toggleScheduled = async (id: string) => {
    const r = await apiFetch(`/Reports/scheduled/${id}/toggle`, { method: "PATCH" });
    if (r.ok) { const updated = await r.json(); setScheduled(s => s.map(x => x.id === id ? updated : x)); }
  };

  const maxBucketRev = summary ? Math.max(...summary.buckets.map(b => b.revenue), 1) : 1;

  return (
    <AppShell title="Raporlar">

      {/* Period selector + tab switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {PERIODS.map(({ value, label }) => (
          <button key={value} onClick={() => setPeriod(value)} style={{
            padding: "8px 18px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
            background: period === value ? "#7c3aed" : "#f1f5f9",
            color: period === value ? "#fff" : "#64748b",
          }}>{label}</button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {([ ["ozet","📊 Özet"], ["analiz","🔍 Analizler"], ["raporlarim","📋 Raporlarım"] ] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: "8px 14px", border: "none", background: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              color: tab === k ? "#7c3aed" : "#64748b",
              borderBottom: tab === k ? "2px solid #7c3aed" : "2px solid transparent",
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* ── ÖZET TAB ──────────────────────────────────────────────────── */}
      {tab === "ozet" && (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid #f1f5f9" }}>
            {([ ["genel","📊 Genel"], ["stilist","✂ Stilist Prim"] ] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => setSubTab(k)} style={{
                padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 13, color: subTab === k ? "#7c3aed" : "#64748b",
                borderBottom: subTab === k ? "2px solid #7c3aed" : "2px solid transparent", marginBottom: -2,
              }}>{lbl}</button>
            ))}
          </div>

          {subTab === "genel" && summary && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
                {[
                  ["Toplam Ciro",  `₺${fmt(summary.totalRevenue)}`, "#7c3aed"],
                  ["Nakit",        `₺${fmt(summary.totalCash)}`,    "#16a34a"],
                  ["Kart",         `₺${fmt(summary.totalCard)}`,    "#2563eb"],
                  ["Havale",       `₺${fmt(summary.totalBank)}`,    "#0891b2"],
                  ["Masraf",       `₺${fmt(summary.totalExpenses)}`,"#dc2626"],
                  ["İşlem",        summary.txCount.toString(),       "#d97706"],
                ].map(([lbl, val, color]) => (
                  <div key={lbl as string} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #f1f5f9", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{lbl}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: color as string }}>{val}</div>
                  </div>
                ))}
              </div>
              {summary.buckets.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", padding: "16px 20px", marginBottom: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Ciro Grafiği</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100, overflowX: "auto" }}>
                    {summary.buckets.map(b => (
                      <div key={b.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "1 0 32px", minWidth: 32 }}>
                        <div style={{ fontSize: 10, color: "#7c3aed", marginBottom: 2, fontWeight: 700 }}>{b.revenue > 0 ? `₺${fmtK(b.revenue)}` : ""}</div>
                        <div style={{ width: "100%", borderRadius: "4px 4px 0 0", background: "#7c3aed", height: `${Math.max((b.revenue / maxBucketRev) * 72, b.revenue > 0 ? 4 : 0)}px`, transition: "height 0.3s" }} title={`₺${fmt(b.revenue)}\n${b.count} işlem`} />
                        <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{b.label.slice(5)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {subTab === "stilist" && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontWeight: 800, fontSize: 14 }}>Stilist Prim Raporu</div>
              {commissions.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Bu dönemde veri yok.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ background: "#faf5ff" }}>
                      {["Stilist","Ücret Tipi","Ciro","Oran","Prim/Ücret","İşlem"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {commissions.map((c, i) => (
                        <tr key={c.stylistId} style={{ borderTop: i === 0 ? "none" : "1px solid #f8fafc" }}>
                          <td style={{ padding: "10px 16px", fontWeight: 700 }}>{c.stylistName}</td>
                          <td style={{ padding: "10px 16px", fontSize: 12, color: "#7c3aed" }}>{PAY_TYPE_LABELS[c.payType] ?? c.payType}</td>
                          <td style={{ padding: "10px 16px", fontWeight: 700 }}>₺{fmt(c.revenue)}</td>
                          <td style={{ padding: "10px 16px", fontSize: 12, color: "#64748b" }}>{c.payType === "commission" ? `%${c.commissionRate}` : `₺${fmt(c.fixedSalary)}`}</td>
                          <td style={{ padding: "10px 16px", fontWeight: 900, color: "#16a34a" }}>{c.payType === "commission" ? `₺${fmt(c.commission)}` : "—"}</td>
                          <td style={{ padding: "10px 16px", color: "#94a3b8", fontSize: 12 }}>{c.txCount}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr style={{ borderTop: "2px solid #f1f5f9", background: "#faf5ff" }}>
                      <td colSpan={2} style={{ padding: "10px 16px", fontWeight: 800, fontSize: 13 }}>Toplam</td>
                      <td style={{ padding: "10px 16px", fontWeight: 900 }}>₺{fmt(commissions.reduce((s,c) => s + c.revenue, 0))}</td>
                      <td /><td style={{ padding: "10px 16px", fontWeight: 900, color: "#16a34a" }}>₺{fmt(commissions.reduce((s,c) => s + c.commission, 0))}</td>
                      <td style={{ padding: "10px 16px", color: "#94a3b8", fontSize: 12 }}>{commissions.reduce((s,c) => s + c.txCount, 0)}</td>
                    </tr></tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {subTab === "genel" && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden", marginTop: 20 }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontWeight: 800, fontSize: 14 }}>
                İşlem Geçmişi <span style={{ marginLeft: 10, fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{txTotal} kayıt</span>
              </div>
              {txLoading ? <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
              : txs.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Bu dönemde işlem yok.</div>
              : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ background: "#faf5ff" }}>
                      {["Tarih/Saat","Stilist","Müşteri","Ödeme","Tutar","Kalem",""].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {txs.map((t, i) => (
                        <tr key={t.id} style={{ borderTop: i === 0 ? "none" : "1px solid #f8fafc" }}>
                          <td style={{ padding: "10px 16px", color: "#64748b", whiteSpace: "nowrap", fontSize: 12 }}>
                            {new Date(t.createdAtUtc).toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" })}
                          </td>
                          <td style={{ padding: "10px 16px", fontWeight: 600 }}>{t.stylistName ?? "—"}</td>
                          <td style={{ padding: "10px 16px" }}>{t.customerName ?? "—"}</td>
                          <td style={{ padding: "10px 16px", fontSize: 12 }}>{PAY_LABELS[t.paymentMethod] ?? t.paymentMethod}</td>
                          <td style={{ padding: "10px 16px", fontWeight: 900, color: "#7c3aed" }}>₺{fmt(t.total)}</td>
                          <td style={{ padding: "10px 16px", color: "#94a3b8", fontSize: 12 }}>{t.itemCount}</td>
                          <td style={{ padding: "10px 16px" }}>
                            <button onClick={() => openReceipt(t.id)} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #e9d5ff", background: "#faf5ff", color: "#7c3aed", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>🧾 Fiş</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {txTotal > 30 && (
                <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8, justifyContent: "center" }}>
                  {Array.from({ length: Math.min(Math.ceil(txTotal / 30), 10) }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setTxPage(p)} style={{
                      width: 32, height: 32, borderRadius: 8, border: "1px solid",
                      borderColor: txPage === p ? "#7c3aed" : "#e2e8f0",
                      background: txPage === p ? "#7c3aed" : "#fff",
                      color: txPage === p ? "#fff" : "#344054",
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                    }}>{p}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── ANALİZ TAB ────────────────────────────────────────────────── */}
      {tab === "analiz" && (
        analyticsLoading ? <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>Analiz yükleniyor...</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Hizmet + Müşteri */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
              <div style={{ flex: "2 1 300px", background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontWeight: 800, fontSize: 14 }}>Hizmet / Ürün Analizi</div>
                {services.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Veri yok.</div> : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead><tr style={{ background: "#faf5ff" }}>
                        {["Hizmet/Ürün","Adet","Ciro","Ort. Fiyat"].map(h => (
                          <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {services.map((s, i) => (
                          <tr key={s.name} style={{ borderTop: i === 0 ? "none" : "1px solid #f8fafc" }}>
                            <td style={{ padding: "9px 14px", fontWeight: 600 }}>{s.name}</td>
                            <td style={{ padding: "9px 14px", color: "#64748b" }}>{s.count}</td>
                            <td style={{ padding: "9px 14px", fontWeight: 700, color: "#7c3aed" }}>₺{fmt(s.revenue)}</td>
                            <td style={{ padding: "9px 14px", color: "#64748b", fontSize: 12 }}>₺{fmt(s.avgPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {custAnalytics && (
                <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", padding: "16px 20px" }}>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Müşteri Analizi</div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 100px", textAlign: "center", padding: "12px 8px", background: "#f0fdf4", borderRadius: 10 }}>
                        <div style={{ fontSize: 26, fontWeight: 900, color: "#16a34a" }}>{custAnalytics.newCustomerCount}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Yeni Müşteri</div>
                      </div>
                      <div style={{ flex: "1 1 100px", textAlign: "center", padding: "12px 8px", background: "#eff6ff", borderRadius: 10 }}>
                        <div style={{ fontSize: 26, fontWeight: 900, color: "#2563eb" }}>{custAnalytics.returningCustomerCount}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Geri Dönen</div>
                      </div>
                    </div>
                  </div>
                  {custAnalytics.topCustomers.length > 0 && (
                    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
                      <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, fontSize: 13 }}>Top Müşteriler</div>
                      {custAnalytics.topCustomers.slice(0,5).map((c, i) => (
                        <div key={i} style={{ padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid #f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.visits} ziyaret</div>
                          </div>
                          <div style={{ fontWeight: 700, color: "#7c3aed", fontSize: 14 }}>₺{fmt(c.spent)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Randevu + Ödeme + Masraf */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
              {apptAnalytics && (
                <div style={{ flex: "2 1 280px", background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", padding: "16px 20px" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Randevu Analizi</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                    {[
                      ["Toplam",    apptAnalytics.total,     "#7c3aed"],
                      ["Tamamlanan",apptAnalytics.completed, "#16a34a"],
                      ["İptal",     apptAnalytics.cancelled, "#dc2626"],
                      ["Gelmedi",   apptAnalytics.noShow,    "#d97706"],
                    ].map(([l, v, c]) => (
                      <div key={l as string} style={{ flex: "1 1 80px", textAlign: "center", padding: "10px 6px", background: "#f8fafc", borderRadius: 10 }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: c as string }}>{v}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{l}</div>
                      </div>
                    ))}
                    <div style={{ flex: "1 1 80px", textAlign: "center", padding: "10px 6px", background: "#faf5ff", borderRadius: 10 }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: "#7c3aed" }}>%{apptAnalytics.completionRate}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Tamamlanma</div>
                    </div>
                  </div>
                  {apptAnalytics.byStylist.length > 0 && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead><tr style={{ background: "#faf5ff" }}>
                          <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: 700, color: "#64748b" }}>Stilist</th>
                          <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: 700, color: "#64748b" }}>Toplam</th>
                          <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: 700, color: "#64748b" }}>Tamamlanan</th>
                          <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: 700, color: "#64748b" }}>İptal</th>
                        </tr></thead>
                        <tbody>
                          {apptAnalytics.byStylist.map((s, i) => (
                            <tr key={i} style={{ borderTop: i === 0 ? "none" : "1px solid #f8fafc" }}>
                              <td style={{ padding: "7px 10px", fontWeight: 600 }}>{s.name}</td>
                              <td style={{ padding: "7px 10px" }}>{s.total}</td>
                              <td style={{ padding: "7px 10px", color: "#16a34a", fontWeight: 700 }}>{s.completed}</td>
                              <td style={{ padding: "7px 10px", color: "#dc2626" }}>{s.cancelled}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 16 }}>
                {payments.length > 0 && (
                  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", padding: "16px 20px" }}>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Ödeme Dağılımı</div>
                    {payments.map((p, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600 }}>{p.method}</span>
                          <span style={{ color: "#7c3aed", fontWeight: 700 }}>₺{fmt(p.amount)} <span style={{ color: "#94a3b8", fontWeight: 400, fontSize: 11 }}>({p.pct}%)</span></span>
                        </div>
                        <div style={{ height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${p.pct}%`, background: "#7c3aed", borderRadius: 3 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {expenses.length > 0 && (
                  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, fontSize: 13 }}>Masraf Kategorileri</div>
                    {expenses.map((e, i) => (
                      <div key={i} style={{ padding: "9px 16px", borderTop: i === 0 ? "none" : "1px solid #f8fafc", display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13 }}>{e.category} <span style={{ color: "#94a3b8", fontSize: 11 }}>({e.count})</span></span>
                        <span style={{ fontWeight: 700, color: "#dc2626", fontSize: 13 }}>₺{fmt(e.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Stilist performans */}
            {stylistPerf.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontWeight: 800, fontSize: 14 }}>Stilist Performansı</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ background: "#faf5ff" }}>
                      {["Stilist","İşlem","Ciro","Ort. Sepet","Müşteri"].map(h => (
                        <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {stylistPerf.map((s, i) => (
                        <tr key={s.name} style={{ borderTop: i === 0 ? "none" : "1px solid #f8fafc" }}>
                          <td style={{ padding: "9px 16px", fontWeight: 700 }}>{s.name}</td>
                          <td style={{ padding: "9px 16px", color: "#64748b" }}>{s.txCount}</td>
                          <td style={{ padding: "9px 16px", fontWeight: 700, color: "#7c3aed" }}>₺{fmt(s.revenue)}</td>
                          <td style={{ padding: "9px 16px", color: "#64748b" }}>₺{fmt(s.avgTicket)}</td>
                          <td style={{ padding: "9px 16px", color: "#64748b" }}>{s.customerCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Saatlik yoğunluk */}
            {hourly.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", padding: "16px 20px" }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Saatlik Yoğunluk</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {Array.from({ length: 24 }, (_, h) => {
                    const b = hourly.find(x => x.hour === h);
                    const maxCount = Math.max(...hourly.map(x => x.count), 1);
                    const intensity = b ? b.count / maxCount : 0;
                    return (
                      <div key={h} title={b ? `${h}:00 — ${b.count} işlem, ₺${fmt(b.revenue)}` : `${h}:00 — boş`}
                        style={{ width: 36, height: 36, borderRadius: 6, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 10, cursor: "default",
                          background: intensity === 0 ? "#f8fafc" : `rgba(124,58,237,${0.15 + intensity * 0.85})`,
                          color: intensity > 0.5 ? "#fff" : "#7c3aed", fontWeight: 700 }}>
                        <div>{h}</div>
                        {b && <div style={{ fontSize: 9 }}>{b.count}</div>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>Renk yoğunluğu işlem sayısını gösterir. Hover ile detay.</div>
              </div>
            )}
          </div>
        )
      )}

      {/* ── RAPORLARIM TAB ────────────────────────────────────────────── */}
      {tab === "raporlarim" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Zamanlanmış Raporlarım</div>
            <button onClick={() => { setEditTarget(null); setWizardOpen(true); }} style={{
              padding: "9px 18px", borderRadius: 10, border: "none",
              background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>+ Rapor Oluştur</button>
          </div>

          {scheduled.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", padding: 48, textAlign: "center", color: "#94a3b8" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Henüz rapor yok</div>
              <div style={{ fontSize: 13 }}>Rapor Oluştur butonuna tıklayarak ilk raporunu oluştur.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {scheduled.map(r => (
                <div key={r.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #eaecf0", padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                  <div style={{ flex: "1 1 200px" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      {r.reportTypeLabel} · {FREQ_LABELS[r.frequency] ?? r.frequency}
                      {r.frequency !== "once" && ` · ${String(r.sendHour).padStart(2,"0")}:00`}
                    </div>
                    {r.recipientEmails && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Alıcı: {r.recipientEmails}</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                    {r.lastSentAtUtc && <div style={{ fontSize: 11, color: "#94a3b8" }}>Son: {new Date(r.lastSentAtUtc).toLocaleDateString("tr-TR")}</div>}
                    {r.nextRunAtUtc && r.isActive && <div style={{ fontSize: 11, color: "#64748b" }}>Sonraki: {new Date(r.nextRunAtUtc).toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => { setEditTarget(r); setWizardOpen(true); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e9d5ff", background: "#faf5ff", color: "#7c3aed", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Düzenle</button>
                    {r.frequency !== "once" && (
                      <button onClick={() => toggleScheduled(r.id)} style={{
                        padding: "6px 14px", borderRadius: 8, border: "1px solid",
                        borderColor: r.isActive ? "#dcfce7" : "#e2e8f0",
                        background: r.isActive ? "#f0fdf4" : "#f8fafc",
                        color: r.isActive ? "#16a34a" : "#64748b",
                        fontWeight: 700, fontSize: 12, cursor: "pointer",
                      }}>{r.isActive ? "Aktif" : "Pasif"}</button>
                    )}
                    <button onClick={() => deleteScheduled(r.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fff5f5", color: "#dc2626", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Sil</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── WIZARD / EDIT MODAL ───────────────────────────────────────── */}
      {wizardOpen && (
        <ReportModal
          editTarget={editTarget}
          onClose={() => { setWizardOpen(false); setEditTarget(null); }}
          onSaved={(msg) => {
            setWizardOpen(false); setEditTarget(null);
            loadScheduled();
            toast.success(msg);
          }}
        />
      )}

      {/* ── RECEIPT MODAL ─────────────────────────────────────────────── */}
      {receipt && (
        <>
          <div onClick={() => setReceipt(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(400px, 92vw)", zIndex: 501, background: "#fff", borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>🧾 Adisyon Fişi</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={printReceipt} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🖨 Yazdır</button>
                <button onClick={() => setReceipt(null)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, cursor: "pointer" }}>✕</button>
              </div>
            </div>
            <div ref={printRef} style={{ fontFamily: "monospace", fontSize: 13 }}>
              <div style={{ textAlign: "center", fontWeight: 800, marginBottom: 4 }}>{receipt.salonName}</div>
              <div style={{ textAlign: "center", color: "#64748b", marginBottom: 8 }}>{new Date(receipt.createdAtUtc).toLocaleString("tr-TR")}</div>
              <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />
              {receipt.stylistName  && <div>Stilist: <strong>{receipt.stylistName}</strong></div>}
              {receipt.customerName && <div>Müşteri: <strong>{receipt.customerName}</strong></div>}
              <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />
              <table style={{ width: "100%", fontSize: 12 }}><tbody>
                {receipt.items.map((item, i) => (
                  <tr key={i}><td style={{ paddingRight: 8 }}>{item.quantity > 1 ? `${item.quantity}x ` : ""}{item.name}</td><td style={{ textAlign: "right" }}>₺{fmt(item.lineTotal)}</td></tr>
                ))}
              </tbody></table>
              <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span>Ara Toplam</span><span>₺{fmt(receipt.subtotal)}</span></div>
              {receipt.discountAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#16a34a" }}><span>İskonto</span><span>−₺{fmt(receipt.discountAmount)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 15 }}><span>TOPLAM</span><span>₺{fmt(receipt.total)}</span></div>
              <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />
              <div style={{ fontSize: 12, color: "#64748b" }}>
                Ödeme: {PAY_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod}
                {receipt.cashAmount > 0 && ` | Nakit: ₺${fmt(receipt.cashAmount)}`}
                {receipt.cardAmount > 0 && ` | Kart: ₺${fmt(receipt.cardAmount)}`}
                {receipt.bankAmount > 0 && ` | Havale: ₺${fmt(receipt.bankAmount)}`}
              </div>
              <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#94a3b8" }}>Teşekkürler — xCut tarafından</div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

/* ── Report Modal (create + edit) ───────────────────────────────────── */
function ReportModal({ editTarget, onClose, onSaved }: {
  editTarget: ScheduledReport | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!editTarget;
  const [step, setStep] = useState(1);
  const [name,       setName]       = useState(editTarget?.name ?? "");
  const [reportType, setReportType] = useState(editTarget?.reportType ?? "full");
  const [period,     setPeriod]     = useState(() => {
    if (editTarget?.filtersJson) {
      try { return JSON.parse(editTarget.filtersJson).period ?? "month"; } catch { return "month"; }
    }
    return "month";
  });
  const [frequency,  setFrequency]  = useState(editTarget?.frequency ?? "once");
  const [sendHour,   setSendHour]   = useState(editTarget?.sendHour ?? 8);
  const [emails,     setEmails]     = useState(editTarget?.recipientEmails ?? "");
  const [saving,     setSaving]     = useState(false);

  const valid1 = name.trim().length > 0;
  const valid3 = emails.trim().length > 0;

  const submit = async () => {
    setSaving(true);
    const body = {
      name: name.trim(), reportType, frequency, sendHour,
      recipientEmails: emails.trim(),
      filtersJson: JSON.stringify({ period }),
    };
    const r = isEdit
      ? await apiFetch(`/Reports/scheduled/${editTarget!.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await apiFetch("/Reports/scheduled", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) onSaved(isEdit ? "Rapor güncellendi" : "Rapor oluşturuldu");
    else toast.error(isEdit ? "Güncellenemedi" : "Oluşturulamadı");
  };

  const dot = (n: number) => (
    <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, background: step >= n ? "#7c3aed" : "#f1f5f9", color: step >= n ? "#fff" : "#94a3b8" }}>{n}</div>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(540px, 94vw)", maxHeight: "90vh", overflowY: "auto", zIndex: 501, background: "#fff", borderRadius: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", padding: 28 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{isEdit ? "Raporu Düzenle" : "Rapor Oluştur"}</div>
          <button onClick={onClose} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>

        {/* Step dots */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 24 }}>
          {dot(1)}<div style={{ flex: 1, height: 2, background: step >= 2 ? "#7c3aed" : "#f1f5f9" }} />
          {dot(2)}<div style={{ flex: 1, height: 2, background: step >= 3 ? "#7c3aed" : "#f1f5f9" }} />
          {dot(3)}
        </div>

        {/* Step 1: Name + Type */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#374151" }}>Rapor Adı ve Türü</div>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Rapor Adı</div>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="örn. Aylık Gelir Özeti"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Rapor Türü</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {REPORT_TYPES.map(t => (
                  <button key={t.value} onClick={() => setReportType(t.value)} style={{
                    padding: "8px 14px", borderRadius: 10, border: "2px solid",
                    borderColor: reportType === t.value ? "#7c3aed" : "#e2e8f0",
                    background: reportType === t.value ? "#faf5ff" : "#fff",
                    color: reportType === t.value ? "#7c3aed" : "#64748b",
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}>{t.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Period */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#374151" }}>Kapsayacağı Tarih Aralığı</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[["today","Bugün"],["week","Bu Hafta"],["month","Bu Ay"],["year","Bu Yıl"]].map(([v, l]) => (
                <button key={v} onClick={() => setPeriod(v)} style={{
                  padding: "10px 20px", borderRadius: 10, border: "2px solid",
                  borderColor: period === v ? "#7c3aed" : "#e2e8f0",
                  background: period === v ? "#faf5ff" : "#fff",
                  color: period === v ? "#7c3aed" : "#64748b",
                  fontWeight: 700, fontSize: 14, cursor: "pointer",
                }}>{l}</button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Periyodik raporlarda her çalıştığında seçilen dönemin önceki periyodu alınır (örn. "Bu Ay" seçilirse geçen ay gönderilir).</div>
          </div>
        )}

        {/* Step 3: Delivery */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#374151" }}>Gönderim Ayarları</div>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Gönderim Sıklığı</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[["once","Tek Seferlik"],["daily","Günlük"],["weekly","Haftalık"],["monthly","Aylık"]].map(([v, l]) => (
                  <button key={v} onClick={() => setFrequency(v)} style={{
                    padding: "8px 16px", borderRadius: 10, border: "2px solid",
                    borderColor: frequency === v ? "#7c3aed" : "#e2e8f0",
                    background: frequency === v ? "#faf5ff" : "#fff",
                    color: frequency === v ? "#7c3aed" : "#64748b",
                    fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}>{l}</button>
                ))}
              </div>
            </div>
            {frequency !== "once" && (
              <div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Gönderim Saati (UTC)</div>
                <select value={sendHour} onChange={e => setSendHour(Number(e.target.value))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, background: "#fff", cursor: "pointer" }}>
                  {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                </select>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Türkiye saati UTC+3'tür. 08:00 UTC = 11:00 Türkiye.</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>E-posta Adresleri (virgülle ayır)</div>
              <input value={emails} onChange={e => setEmails(e.target.value)}
                placeholder="ornek@salon.com, diger@salon.com"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            {frequency === "once" && (
              <div style={{ padding: "10px 14px", background: "#eff6ff", borderRadius: 10, fontSize: 12, color: "#2563eb" }}>
                Rapor kaydedilince hemen gönderilecek.
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, gap: 10 }}>
          <button onClick={step === 1 ? onClose : () => setStep(s => s - 1)} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#64748b" }}>
            {step === 1 ? "İptal" : "Geri"}
          </button>
          <button
            onClick={step < 3 ? () => setStep(s => s + 1) : submit}
            disabled={(step === 1 && !valid1) || (step === 3 && !valid3) || saving}
            style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: (step === 1 && !valid1) || (step === 3 && !valid3) ? "#e9d5ff" : "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            {step < 3 ? "İleri" : saving ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Oluştur"}
          </button>
        </div>
      </div>
    </>
  );
}
