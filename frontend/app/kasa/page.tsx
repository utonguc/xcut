"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

/* ── Types ───────────────────────────────────────────────────────────── */
type Stylist = { id: string; fullName: string; specialty?: string; commissionRate: number };
type Service = { id: string; name: string; category: string; price: number };
type CartItem = { serviceId?: string; name: string; unitPrice: number; quantity: number };

type MonthlySummary = {
  year: number; month: number;
  totalRevenue: number; totalCash: number; totalCard: number; txCount: number;
  unassignedTotal: number; unassignedCount: number;
  stylists: {
    stylistId: string; stylistName: string; commissionRate: number;
    totalSales: number; cashSales: number; cardSales: number;
    txCount: number; netPay: number; salonCut: number;
  }[];
};

/* ── Helpers ─────────────────────────────────────────────────────────── */
const fmt = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

/* ══════════════════════════════════════════════════════════════════════ */
export default function KasaPage() {
  const [tab, setTab] = useState<"pos" | "ay-sonu">("pos");

  /* ── Init data ── */
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading,  setLoading]  = useState(true);

  const loadInit = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch("/Pos/init");
    if (res.ok) {
      const d = await res.json();
      setStylists(d.stylists);
      setServices(d.services);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadInit(); }, [loadInit]);

  return (
    <AppShell title="Kasa">
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid #f1f5f9", paddingBottom: 0 }}>
        {([["pos", "🧾 Kasa"], ["ay-sonu", "📊 Ay Sonu"]] as const).map(([key, lbl]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: "10px 20px", border: "none", background: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 14,
            color: tab === key ? "#7c3aed" : "#64748b",
            borderBottom: tab === key ? "2px solid #7c3aed" : "2px solid transparent",
            marginBottom: -2,
          }}>{lbl}</button>
        ))}
      </div>

      {tab === "pos" && (
        <PosPanel stylists={stylists} services={services} loading={loading} />
      )}
      {tab === "ay-sonu" && (
        <AySonuPanel stylists={stylists} onRefreshStylists={loadInit} />
      )}
    </AppShell>
  );
}

/* ════════════════════════════════════════════════════════════════════
   POS PANEL
   ════════════════════════════════════════════════════════════════════ */
function PosPanel({ stylists, services, loading }: {
  stylists: Stylist[]; services: Service[]; loading: boolean;
}) {
  const [cart,          setCart]          = useState<CartItem[]>([]);
  const [stylistId,     setStylistId]     = useState("");
  const [customerName,  setCustomerName]  = useState("");
  const [discountType,  setDiscountType]  = useState<"none"|"percent"|"fixed">("none");
  const [discountValue, setDiscountValue] = useState(0);
  const [payMethod,     setPayMethod]     = useState<"cash"|"card"|"mixed">("cash");
  const [cashAmount,    setCashAmount]    = useState(0);
  const [cardAmount,    setCardAmount]    = useState(0);
  const [search,        setSearch]        = useState("");
  const [processing,    setProcessing]    = useState(false);
  const [receipt,       setReceipt]       = useState<null | {
    total: number; paymentMethod: string; cashAmount: number; cardAmount: number;
  }>(null);

  /* ── Categories ── */
  const categories = Array.from(new Set(services.map(s => s.category)));
  const filtered   = services.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.category.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Cart ops ── */
  const addItem = (svc: Service) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.serviceId === svc.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
        return updated;
      }
      return [...prev, { serviceId: svc.id, name: svc.name, unitPrice: svc.price, quantity: 1 }];
    });
  };

  const changeQty = (idx: number, delta: number) => {
    setCart(prev => {
      const updated = [...prev];
      const newQty = updated[idx].quantity + delta;
      if (newQty <= 0) return prev.filter((_, i) => i !== idx);
      updated[idx] = { ...updated[idx], quantity: newQty };
      return updated;
    });
  };

  const removeItem = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));

  /* ── Totals ── */
  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discountAmount = discountType === "percent"
    ? Math.round(subtotal * discountValue) / 100
    : discountType === "fixed" ? Math.min(discountValue, subtotal) : 0;
  const total = Math.max(0, subtotal - discountAmount);

  /* ── Mixed payment sync ── */
  useEffect(() => {
    if (payMethod === "mixed") {
      setCardAmount(prev => Math.min(prev, total));
      setCashAmount(total - Math.min(cardAmount, total));
    }
  }, [total, payMethod]);

  /* ── Checkout ── */
  const checkout = async () => {
    if (cart.length === 0) return;
    setProcessing(true);
    const res = await apiFetch("/Pos/checkout", {
      method: "POST",
      body: JSON.stringify({
        stylistId:    stylistId || null,
        customerName: customerName || null,
        items:        cart.map(i => ({ serviceId: i.serviceId ?? null, name: i.name, unitPrice: i.unitPrice, quantity: i.quantity })),
        discountType,
        discountValue,
        paymentMethod: payMethod,
        cashAmount:    payMethod === "card"  ? 0 : payMethod === "cash" ? total : cashAmount,
        cardAmount:    payMethod === "cash"  ? 0 : payMethod === "card" ? total : cardAmount,
        notes:         null,
      }),
    });
    setProcessing(false);
    if (res.ok) {
      const data = await res.json();
      setReceipt({ total: data.total, paymentMethod: data.paymentMethod, cashAmount: data.cashAmount, cardAmount: data.cardAmount });
      setCart([]);
      setCustomerName("");
      setDiscountType("none");
      setDiscountValue(0);
      setPayMethod("cash");
    } else {
      alert("Ödeme alınamadı.");
    }
  };

  if (receipt) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 40, maxWidth: 400, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.08)", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 900 }}>Ödeme alındı!</h2>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#7c3aed", marginBottom: 24 }}>₺{fmt(receipt.total)}</div>
          <div style={{ background: "#f8fafc", borderRadius: 12, padding: 16, marginBottom: 24, textAlign: "left" }}>
            {receipt.paymentMethod === "cash"  && <div style={{ fontSize: 15 }}>💵 Nakit: <strong>₺{fmt(receipt.cashAmount)}</strong></div>}
            {receipt.paymentMethod === "card"  && <div style={{ fontSize: 15 }}>💳 Kart: <strong>₺{fmt(receipt.cardAmount)}</strong></div>}
            {receipt.paymentMethod === "mixed" && <>
              <div style={{ fontSize: 15 }}>💵 Nakit: <strong>₺{fmt(receipt.cashAmount)}</strong></div>
              <div style={{ fontSize: 15, marginTop: 6 }}>💳 Kart: <strong>₺{fmt(receipt.cardAmount)}</strong></div>
            </>}
          </div>
          <button onClick={() => setReceipt(null)} style={{
            width: "100%", padding: "14px", borderRadius: 12, border: "none",
            background: "linear-gradient(135deg, #7c3aed, #a21caf)",
            color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer",
          }}>
            Yeni Satış →
          </button>
        </div>
      </div>
    );
  }

  const categories2 = Array.from(new Set(filtered.map(s => s.category)));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, height: "calc(100vh - 180px)" }}>

      {/* ── Left: Service Catalog ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
        <input
          placeholder="🔍 Hizmet ara..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0",
            fontSize: 14, outline: "none", background: "#fff",
          }}
        />
        <div style={{ overflowY: "auto", flex: 1, paddingRight: 4 }}>
          {loading ? (
            <div style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", paddingTop: 40 }}>Yükleniyor...</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", paddingTop: 40 }}>Hizmet bulunamadı</div>
          ) : (
            categories2.map(cat => (
              <div key={cat} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>{cat}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                  {filtered.filter(s => s.category === cat).map(svc => (
                    <button key={svc.id} onClick={() => addItem(svc)} style={{
                      padding: "12px 14px", borderRadius: 10, border: "1px solid #e9d5ff",
                      background: "#faf5ff", cursor: "pointer", textAlign: "left",
                      transition: "all 0.15s",
                    }}
                      onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = "#f3e8ff"; (e.currentTarget as HTMLElement).style.borderColor = "#7c3aed"; }}
                      onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = "#faf5ff"; (e.currentTarget as HTMLElement).style.borderColor = "#e9d5ff"; }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 4 }}>{svc.name}</div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: "#7c3aed" }}>₺{fmt(svc.price)}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Right: Cart & Checkout ── */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 12,
        background: "#fff", borderRadius: 16, padding: 20,
        border: "1px solid #e9d5ff", overflowY: "auto",
      }}>

        {/* Stilist */}
        <div>
          <label style={labelSt}>Stilist</label>
          <select value={stylistId} onChange={e => setStylistId(e.target.value)} style={selectSt}>
            <option value="">Stilist seçin (isteğe bağlı)</option>
            {stylists.map(s => <option key={s.id} value={s.id}>{s.fullName}{s.specialty ? ` · ${s.specialty}` : ""}</option>)}
          </select>
        </div>

        {/* Müşteri */}
        <div>
          <label style={labelSt}>Müşteri Adı</label>
          <input
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="İsteğe bağlı"
            style={inputSt}
          />
        </div>

        {/* Cart */}
        <div style={{ flex: 1, minHeight: 100 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>Sepet</div>
          {cart.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
              Sol taraftan hizmet ekleyin
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cart.map((item, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#faf5ff", borderRadius: 8 }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{item.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button onClick={() => changeQty(idx, -1)} style={qtyBtn}>−</button>
                    <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{item.quantity}</span>
                    <button onClick={() => changeQty(idx, +1)} style={qtyBtn}>+</button>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#7c3aed", minWidth: 60, textAlign: "right" }}>
                    ₺{fmt(item.unitPrice * item.quantity)}
                  </div>
                  <button onClick={() => removeItem(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 16, padding: "0 2px" }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* İskonto */}
        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
          <label style={labelSt}>İskonto</label>
          <div style={{ display: "flex", gap: 6 }}>
            {(["none","percent","fixed"] as const).map(type => (
              <button key={type} onClick={() => { setDiscountType(type); setDiscountValue(0); }} style={{
                padding: "6px 12px", borderRadius: 8, border: "1px solid",
                borderColor: discountType === type ? "#7c3aed" : "#e2e8f0",
                background: discountType === type ? "#f5f3ff" : "#fff",
                color: discountType === type ? "#7c3aed" : "#64748b",
                fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}>
                {type === "none" ? "Yok" : type === "percent" ? "%" : "₺"}
              </button>
            ))}
            {discountType !== "none" && (
              <input
                type="number" min="0" max={discountType === "percent" ? 100 : subtotal}
                value={discountValue || ""}
                onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                placeholder={discountType === "percent" ? "%" : "₺"}
                style={{ ...inputSt, width: 80, marginBottom: 0 }}
              />
            )}
          </div>
        </div>

        {/* Ödeme yöntemi */}
        <div>
          <label style={labelSt}>Ödeme Yöntemi</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {([["cash","💵 Nakit"],["card","💳 Kart"],["mixed","↔ Karma"]] as const).map(([m, lbl]) => (
              <button key={m} onClick={() => setPayMethod(m)} style={{
                padding: "8px 14px", borderRadius: 8, border: "1px solid",
                borderColor: payMethod === m ? "#7c3aed" : "#e2e8f0",
                background: payMethod === m ? "#7c3aed" : "#fff",
                color: payMethod === m ? "#fff" : "#344054",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}>{lbl}</button>
            ))}
          </div>
          {payMethod === "mixed" && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ ...labelSt, marginTop: 0, fontSize: 11 }}>💵 Nakit</label>
                <input type="number" min="0" max={total} value={cashAmount || ""}
                  onChange={e => { const v = parseFloat(e.target.value) || 0; setCashAmount(v); setCardAmount(Math.max(0, total - v)); }}
                  style={inputSt} placeholder="₺" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...labelSt, marginTop: 0, fontSize: 11 }}>💳 Kart</label>
                <input type="number" min="0" max={total} value={cardAmount || ""}
                  onChange={e => { const v = parseFloat(e.target.value) || 0; setCardAmount(v); setCashAmount(Math.max(0, total - v)); }}
                  style={inputSt} placeholder="₺" />
              </div>
            </div>
          )}
        </div>

        {/* Toplam */}
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 14, borderTop: "2px solid #e9d5ff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b", marginBottom: 4 }}>
            <span>Ara Toplam</span><span>₺{fmt(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#16a34a", marginBottom: 4 }}>
              <span>İskonto</span><span>−₺{fmt(discountAmount)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900, color: "#0f172a" }}>
            <span>Toplam</span><span>₺{fmt(total)}</span>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={checkout}
          disabled={cart.length === 0 || processing}
          style={{
            padding: "14px", borderRadius: 12, border: "none",
            background: cart.length === 0 ? "#e9d5ff" : "linear-gradient(135deg, #7c3aed, #a21caf)",
            color: cart.length === 0 ? "#a78bfa" : "#fff",
            fontWeight: 900, fontSize: 16, cursor: cart.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {processing ? "İşleniyor..." : `Ödeme Al · ₺${fmt(total)}`}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   AY SONU PANEL
   ════════════════════════════════════════════════════════════════════ */
function AySonuPanel({ stylists, onRefreshStylists }: { stylists: Stylist[]; onRefreshStylists: () => void }) {
  const now = new Date();
  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [editComm, setEditComm] = useState<Record<string, string>>({});
  const [savingComm, setSavingComm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`/Pos/monthly-summary?year=${year}&month=${month}`);
    if (res.ok) setSummary(await res.json());
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const saveCommission = async (stylistId: string) => {
    const val = parseFloat(editComm[stylistId] ?? "");
    if (isNaN(val)) return;
    setSavingComm(stylistId);
    await apiFetch(`/Pos/stylists/${stylistId}/commission`, {
      method: "PATCH",
      body: JSON.stringify({ commissionRate: val }),
    });
    setSavingComm(null);
    setEditComm(prev => { const n = { ...prev }; delete n[stylistId]; return n; });
    onRefreshStylists();
    load();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Month picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <select value={year} onChange={e => setYear(+e.target.value)} style={selectSt}>
          {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={selectSt}>
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <button onClick={load} style={{
          padding: "8px 18px", borderRadius: 8, border: "1px solid #7c3aed",
          background: "#f5f3ff", color: "#7c3aed", fontWeight: 700, fontSize: 14, cursor: "pointer",
        }}>Hesapla</button>
      </div>

      {loading && <div style={{ color: "#94a3b8", fontSize: 14 }}>Yükleniyor...</div>}

      {summary && !loading && (
        <>
          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            {[
              ["Toplam Ciro", `₺${fmt(summary.totalRevenue)}`, "#7c3aed"],
              ["Nakit", `₺${fmt(summary.totalCash)}`, "#16a34a"],
              ["Kart", `₺${fmt(summary.totalCard)}`, "#2563eb"],
              ["İşlem Sayısı", summary.txCount.toString(), "#d97706"],
            ].map(([lbl, val, color]) => (
              <div key={lbl} style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", border: "1px solid #f1f5f9" }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{lbl}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Stylist table */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e9d5ff", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", fontWeight: 800, fontSize: 15 }}>
              Stilist Pay Dağılımı — {MONTHS[month - 1]} {year}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#faf5ff" }}>
                    {["Stilist","Ciro","İşlem","Nakit","Kart","Pay %","Net Pay","Salon Payı"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.stylists.map((row, i) => {
                    const commVal = editComm[row.stylistId] ?? row.commissionRate.toString();
                    const editing = row.stylistId in editComm;
                    return (
                      <tr key={row.stylistId} style={{ borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 700 }}>{row.stylistName}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 800, color: "#7c3aed" }}>₺{fmt(row.totalSales)}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{row.txCount}</td>
                        <td style={{ padding: "12px 16px" }}>₺{fmt(row.cashSales)}</td>
                        <td style={{ padding: "12px 16px" }}>₺{fmt(row.cardSales)}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              type="number" min="0" max="100"
                              value={commVal}
                              onChange={e => setEditComm(prev => ({ ...prev, [row.stylistId]: e.target.value }))}
                              style={{
                                width: 56, padding: "4px 8px", borderRadius: 6,
                                border: `1px solid ${editing ? "#7c3aed" : "#e2e8f0"}`,
                                fontSize: 13, fontWeight: 700, textAlign: "center",
                              }}
                            />
                            <span style={{ fontSize: 12, color: "#64748b" }}>%</span>
                            {editing && (
                              <button onClick={() => saveCommission(row.stylistId)} disabled={savingComm === row.stylistId} style={{
                                padding: "4px 8px", borderRadius: 6, border: "none",
                                background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer",
                              }}>
                                {savingComm === row.stylistId ? "..." : "Kaydet"}
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: 900, color: "#16a34a" }}>₺{fmt(row.netPay)}</td>
                        <td style={{ padding: "12px 16px", color: "#dc2626", fontWeight: 700 }}>₺{fmt(row.salonCut)}</td>
                      </tr>
                    );
                  })}

                  {summary.stylists.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                      Bu ayda stiliste bağlı işlem yok.
                    </td></tr>
                  )}

                  {/* Totals row */}
                  {summary.stylists.length > 0 && (
                    <tr style={{ borderTop: "2px solid #e9d5ff", background: "#faf5ff" }}>
                      <td style={{ padding: "12px 16px", fontWeight: 900, color: "#0f172a" }}>Toplam</td>
                      <td style={{ padding: "12px 16px", fontWeight: 900, color: "#7c3aed" }}>₺{fmt(summary.stylists.reduce((s,r) => s+r.totalSales, 0))}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 700 }}>{summary.stylists.reduce((s,r) => s+r.txCount, 0)}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 700 }}>₺{fmt(summary.stylists.reduce((s,r) => s+r.cashSales, 0))}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 700 }}>₺{fmt(summary.stylists.reduce((s,r) => s+r.cardSales, 0))}</td>
                      <td />
                      <td style={{ padding: "12px 16px", fontWeight: 900, color: "#16a34a" }}>₺{fmt(summary.stylists.reduce((s,r) => s+r.netPay, 0))}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 900, color: "#dc2626" }}>₺{fmt(summary.stylists.reduce((s,r) => s+r.salonCut, 0))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {summary.unassignedTotal > 0 && (
              <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", fontSize: 13, color: "#64748b" }}>
                ⚠ Stilist atanmamış {summary.unassignedCount} işlem: <strong>₺{fmt(summary.unassignedTotal)}</strong>
              </div>
            )}
          </div>

          {/* Commission info */}
          <div style={{ background: "#f0fdf4", borderRadius: 12, padding: "14px 18px", border: "1px solid #bbf7d0", fontSize: 13, color: "#15803d" }}>
            💡 Pay yüzdesini değiştirmek için tablodaki % alanını düzenleyin ve <strong>Kaydet</strong>'e tıklayın. Değişiklik ilerleyen hesaplamalara yansır.
          </div>
        </>
      )}
    </div>
  );
}

/* ── Shared styles ─────────────────────────────────────────────────── */
const labelSt: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 700,
  color: "#64748b", marginBottom: 6, marginTop: 4,
};
const inputSt: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8,
  border: "1px solid #e2e8f0", fontSize: 14,
  fontFamily: "inherit", boxSizing: "border-box", outline: "none",
};
const selectSt: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0",
  fontSize: 14, background: "#fff", outline: "none", cursor: "pointer",
};
const qtyBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 6, border: "1px solid #e9d5ff",
  background: "#f5f3ff", cursor: "pointer", fontWeight: 900,
  fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
  lineHeight: 1, padding: 0,
};
