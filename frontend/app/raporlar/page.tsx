"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────────── */
type TxItem = {
  id: string; stylistName?: string; customerName?: string;
  total: number; cashAmount: number; cardAmount: number; bankAmount: number;
  paymentMethod: string; status: string; createdAtUtc: string; itemCount: number;
};
type TxDetail = TxItem & {
  subtotal: number; discountType: string; discountValue: number; discountAmount: number;
  salonName?: string;
  items: { name: string; unitPrice: number; quantity: number; lineTotal: number }[];
};
type Bucket  = { label: string; revenue: number; cash: number; card: number; bank: number; count: number };
type Summary = { totalRevenue: number; totalCash: number; totalCard: number; totalBank: number; totalExpenses: number; txCount: number; buckets: Bucket[] };
type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };
type CommRow = { stylistId: string; stylistName: string; payType: string; commissionRate: number; fixedSalary: number; revenue: number; commission: number; txCount: number };

const fmt    = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PERIODS = [["today","Bugün"],["week","Bu Hafta"],["month","Bu Ay"],["year","Bu Yıl"]] as const;
const PAY_LABELS: Record<string, string> = { cash: "💵 Nakit", card: "💳 Kart", mixed: "↔ Karma", bank: "🏦 Havale" };
const PAY_TYPE_LABELS: Record<string, string> = { commission: "Prim", fixed_monthly: "Aylık Sabit", fixed_weekly: "Haftalık Sabit", fixed_daily: "Günlük" };

export default function RaporlarPage() {
  const [period,  setPeriod]  = useState<"today"|"week"|"month"|"year">("month");
  const [tab,     setTab]     = useState<"genel"|"stilist">("genel");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txs,     setTxs]     = useState<TxItem[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<TxDetail | null>(null);
  const [commissions, setCommissions] = useState<CommRow[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  const loadSummary = useCallback(async () => {
    const r = await apiFetch(`/Reports/summary?period=${period}`);
    if (r.ok) setSummary(await r.json());
    const cr = await apiFetch(`/Reports/commissions?period=${period}`);
    if (cr.ok) setCommissions(await cr.json());
  }, [period]);

  const loadTxs = useCallback(async (p: number) => {
    setLoading(true);
    const now = new Date();
    let from: Date, to: Date;
    if (period === "today") { from = new Date(now.setHours(0,0,0,0)); to = new Date(); }
    else if (period === "week") { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); from = new Date(d.setHours(0,0,0,0)); to = new Date(); }
    else if (period === "year") { from = new Date(now.getFullYear(), 0, 1); to = new Date(); }
    else { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(); }

    const r = await apiFetch(`/Reports/transactions?from=${from.toISOString()}&to=${to.toISOString()}&page=${p}&pageSize=30`);
    if (r.ok) {
      const d: Paged<TxItem> = await r.json();
      setTxs(d.items);
      setTotal(d.total);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => { setPage(1); loadSummary(); }, [loadSummary]);
  useEffect(() => { loadTxs(page); }, [loadTxs, page]);

  const openReceipt = async (id: string) => {
    const r = await apiFetch(`/Reports/transactions/${id}`);
    if (r.ok) setReceipt(await r.json());
  };

  const printReceipt = () => {
    if (!printRef.current) return;
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`<html><head><title>Fiş</title><style>
      body{font-family:monospace;font-size:13px;padding:16px;max-width:340px;margin:0 auto}
      .center{text-align:center} .bold{font-weight:bold} .line{border-top:1px dashed #999;margin:8px 0}
      table{width:100%} td{padding:2px 0} .right{text-align:right}
    </style></head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  return (
    <AppShell title="Raporlar">
      {/* Period + tab selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {PERIODS.map(([k, lbl]) => (
          <button key={k} onClick={() => setPeriod(k)} style={{
            padding: "8px 18px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
            background: period === k ? "#7c3aed" : "#f1f5f9",
            color: period === k ? "#fff" : "#64748b",
          }}>{lbl}</button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, borderBottom: "2px solid #f1f5f9" }}>
          {([["genel","📊 Genel"],["stilist","✂ Stilist Prim"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              color: tab === k ? "#7c3aed" : "#64748b",
              borderBottom: tab === k ? "2px solid #7c3aed" : "2px solid transparent",
              marginBottom: -2,
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      {tab === "stilist" && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontWeight: 800, fontSize: 14 }}>
            Stilist Prim Raporu
          </div>
          {commissions.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Bu dönemde veri yok.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#faf5ff" }}>
                    {["Stilist","Ücret Tipi","Ciro","Prim/Ücret Oranı","Prim Tutarı","İşlem"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c, i) => (
                    <tr key={c.stylistId} style={{ borderTop: i === 0 ? "none" : "1px solid #f8fafc" }}>
                      <td style={{ padding: "10px 16px", fontWeight: 700 }}>{c.stylistName}</td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: "#7c3aed" }}>{PAY_TYPE_LABELS[c.payType] ?? c.payType}</td>
                      <td style={{ padding: "10px 16px", fontWeight: 700 }}>₺{fmt(c.revenue)}</td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: "#64748b" }}>
                        {c.payType === "commission" ? `%${c.commissionRate}` : `₺${fmt(c.fixedSalary)}`}
                      </td>
                      <td style={{ padding: "10px 16px", fontWeight: 900, color: "#16a34a" }}>
                        {c.payType === "commission" ? `₺${fmt(c.commission)}` : "—"}
                      </td>
                      <td style={{ padding: "10px 16px", color: "#94a3b8", fontSize: 12 }}>{c.txCount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid #f1f5f9", background: "#faf5ff" }}>
                    <td colSpan={2} style={{ padding: "10px 16px", fontWeight: 800, fontSize: 13 }}>Toplam</td>
                    <td style={{ padding: "10px 16px", fontWeight: 900 }}>₺{fmt(commissions.reduce((s,c) => s + c.revenue, 0))}</td>
                    <td />
                    <td style={{ padding: "10px 16px", fontWeight: 900, color: "#16a34a" }}>₺{fmt(commissions.reduce((s,c) => s + c.commission, 0))}</td>
                    <td style={{ padding: "10px 16px", color: "#94a3b8", fontSize: 12 }}>{commissions.reduce((s,c) => s + c.txCount, 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "genel" && summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            ["Toplam Ciro",  `₺${fmt(summary.totalRevenue)}`, "#7c3aed"],
            ["Nakit",        `₺${fmt(summary.totalCash)}`,    "#16a34a"],
            ["Kart",         `₺${fmt(summary.totalCard)}`,    "#2563eb"],
            ["Havale",       `₺${fmt(summary.totalBank)}`,    "#0891b2"],
            ["Masraf",       `₺${fmt(summary.totalExpenses)}`,"#dc2626"],
            ["İşlem",        summary.txCount.toString(),      "#d97706"],
          ].map(([lbl, val, color]) => (
            <div key={lbl} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #f1f5f9", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{lbl}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: color as string }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "genel" && <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontWeight: 800, fontSize: 14 }}>
          İşlem Geçmişi
          <span style={{ marginLeft: 10, fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{total} kayıt</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
        ) : txs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Bu dönemde işlem yok.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#faf5ff" }}>
                  {["Tarih/Saat","Stilist","Müşteri","Ödeme","Tutar","Kalem",""].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
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
                      <button onClick={() => openReceipt(t.id)} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #e9d5ff", background: "#faf5ff", color: "#7c3aed", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        🧾 Fiş
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 30 && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8, justifyContent: "center" }}>
            {Array.from({ length: Math.ceil(total / 30) }, (_, i) => i + 1).slice(0, 10).map(p => (
              <button key={p} onClick={() => setPage(p)} style={{
                width: 32, height: 32, borderRadius: 8, border: "1px solid",
                borderColor: page === p ? "#7c3aed" : "#e2e8f0",
                background: page === p ? "#7c3aed" : "#fff",
                color: page === p ? "#fff" : "#344054",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}>{p}</button>
            ))}
          </div>
        )}
      </div>}

      {/* Receipt modal */}
      {receipt && (
        <>
          <div onClick={() => setReceipt(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: "min(400px, 92vw)", zIndex: 501,
            background: "#fff", borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
            padding: 24, display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>🧾 Adisyon Fişi</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={printReceipt} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🖨 Yazdır</button>
                <button onClick={() => setReceipt(null)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, cursor: "pointer" }}>✕</button>
              </div>
            </div>

            <div ref={printRef} style={{ fontFamily: "monospace", fontSize: 13 }}>
              <div className="center bold" style={{ textAlign: "center", fontWeight: 800, marginBottom: 4 }}>{receipt.salonName}</div>
              <div className="center" style={{ textAlign: "center", color: "#64748b", marginBottom: 8 }}>
                {new Date(receipt.createdAtUtc).toLocaleString("tr-TR")}
              </div>
              <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />
              {receipt.stylistName && <div>Stilist: <strong>{receipt.stylistName}</strong></div>}
              {receipt.customerName && <div>Müşteri: <strong>{receipt.customerName}</strong></div>}
              <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />
              <table style={{ width: "100%", fontSize: 12 }}>
                <tbody>
                  {receipt.items.map((item, i) => (
                    <tr key={i}>
                      <td style={{ paddingRight: 8 }}>{item.quantity > 1 ? `${item.quantity}x ` : ""}{item.name}</td>
                      <td style={{ textAlign: "right" }}>₺{fmt(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>Ara Toplam</span><span>₺{fmt(receipt.subtotal)}</span>
              </div>
              {receipt.discountAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#16a34a" }}>
                  <span>İskonto</span><span>−₺{fmt(receipt.discountAmount)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 15 }}>
                <span>TOPLAM</span><span>₺{fmt(receipt.total)}</span>
              </div>
              <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />
              <div style={{ fontSize: 12, color: "#64748b" }}>
                Ödeme: {PAY_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod}
                {receipt.cashAmount > 0 && ` | Nakit: ₺${fmt(receipt.cashAmount)}`}
                {receipt.cardAmount > 0 && ` | Kart: ₺${fmt(receipt.cardAmount)}`}
                {receipt.bankAmount > 0 && ` | Havale: ₺${fmt(receipt.bankAmount)}`}
              </div>
              <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#94a3b8" }}>
                Teşekkürler — xCut tarafından
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
