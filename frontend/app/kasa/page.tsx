"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { useIsMobile } from "@/hooks/useIsMobile";

/* ── Types ───────────────────────────────────────────────────────────── */
type Stylist     = { id: string; fullName: string; specialty?: string };
type Service     = { id: string; name: string; category: string; price: number };
type StockItem   = { id: string; name: string; category?: string; barcode?: string; salePrice: number; staffBonusPct: number; quantity: number; unit?: string };
type BankAccount = { id: string; bankName: string; accountName: string; isActive: boolean };
type Customer    = { id: string; fullName: string; phone?: string };

type AdisyonItem = {
  id:            string;
  serviceId?:    string;
  stockItemId?:  string;
  staffBonusPct?: number;
  name:          string;
  unitPrice:     number;
  quantity:      number;
};

type Adisyon = {
  id:           string;
  stylistId:    string;
  customerId?:  string;
  customerName: string;
  items:        AdisyonItem[];
  discountType:  "none" | "percent" | "fixed";
  discountValue: number;
  createdAt:    string;
};

type MonthlySummary = {
  year: number; month: number;
  totalRevenue: number; totalCash: number; totalCard: number; totalBank?: number; txCount: number;
  unassignedTotal: number; unassignedCount: number;
  stylists: {
    stylistId: string; stylistName: string; commissionRate: number;
    totalSales: number; cashSales: number; cardSales: number;
    txCount: number; netPay: number; salonCut: number;
  }[];
};

type Expense = {
  id: string; description: string; category: string; amount: number;
  paymentMethod: string; createdAtUtc: string;
};

type TodayStats = {
  totalRevenue: number; totalCash: number; totalCard: number; totalBank: number; txCount: number;
  session: { id: string; openedAtUtc: string; openingBalance: number } | null;
};
type SessionDetail = {
  id: string; openedAtUtc: string; openingBalance: number; status: string;
  totalRevenue: number; totalCash: number; totalCard: number; totalBank: number;
  totalExpenses: number; netCash: number;
};
type SessionHistoryItem = {
  id: string; openedAtUtc: string; closedAtUtc?: string; status: string;
  openingBalance: number; closingBalance?: number; notes?: string;
  totalRevenue: number; totalCash: number; totalCard: number; totalBank: number;
  totalExpenses: number; netCash: number; txCount: number; difference?: number;
};

type HistoryItem = {
  id: string; customerName: string | null; total: number; paymentMethod: string;
  cashAmount: number; cardAmount: number; discountAmount: number; status: string;
  createdAtUtc: string; stylistName: string | null; itemCount: number;
};

/* ── Helpers ─────────────────────────────────────────────────────────── */
const fmt  = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uid  = () => Math.random().toString(36).slice(2, 10);
const STORAGE_KEY = "xcut_adisyons_v2";
const MONTHS      = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const EXP_CATS    = ["Genel","Temizlik","Kira","Elektrik/Su","Malzeme","Personel","Kargo","Diğer"];
const PM_LABELS: Record<string, string> = { cash: "💵 Nakit", card: "💳 Kart", mixed: "↔ Karma", bank: "🏦 Havale" };

function loadAdisyons(): Adisyon[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function saveAdisyons(list: Adisyon[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
function adisyonTotal(a: Adisyon): number {
  const sub = a.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const disc = a.discountType === "percent" ? Math.round(sub * a.discountValue) / 100
    : a.discountType === "fixed" ? Math.min(a.discountValue, sub) : 0;
  return Math.max(0, sub - disc);
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function KasaPage() {
  const { toast, confirm } = useToast();
  const isMobile = useIsMobile();
  const [tab,            setTab]            = useState<"kasa"|"gecmis"|"masraf"|"ay-sonu">("kasa");
  const [stylists,       setStylists]       = useState<Stylist[]>([]);
  const [services,       setServices]       = useState<Service[]>([]);
  const [stockItems,     setStockItems]     = useState<StockItem[]>([]);
  const [bankAccounts,   setBankAccounts]   = useState<BankAccount[]>([]);
  const [customers,      setCustomers]      = useState<Customer[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [todayStats,     setTodayStats]     = useState<TodayStats | null>(null);
  const [openingBal,     setOpeningBal]     = useState("0");
  const [sessionOp,      setSessionOp]      = useState<"open"|null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);

  const loadToday = useCallback(async () => {
    const r = await apiFetch("/Pos/today");
    if (r.ok) setTodayStats(await r.json());
  }, []);

  useEffect(() => {
    (async () => {
      const [posRes, bankRes, custRes, stockRes] = await Promise.all([
        apiFetch("/Pos/init"),
        apiFetch("/BankAccount"),
        apiFetch("/Customers?pageSize=500"),
        apiFetch("/Stock?pageSize=500"),
      ]);
      if (posRes.ok)   { const d = await posRes.json();  setStylists(d.stylists); setServices(d.services); }
      if (bankRes.ok)  setBankAccounts((await bankRes.json()).filter((b: BankAccount) => b.isActive));
      if (custRes.ok)  { const d = await custRes.json(); setCustomers(d.items ?? d); }
      if (stockRes.ok) { const d = await stockRes.json(); setStockItems(Array.isArray(d) ? d : (d.items ?? [])); }
      setLoading(false);
    })();
    loadToday();
  }, [loadToday]);

  const openSession = async () => {
    const bal = parseFloat(openingBal) || 0;
    const r = await apiFetch("/Pos/session/open", { method: "POST", body: JSON.stringify({ openingBalance: bal, notes: null }) });
    if (r.ok) { toast.success("Kasa oturumu açıldı."); setSessionOp(null); loadToday(); }
    else { const d = await r.json().catch(() => ({})); toast.error(d.message ?? "Oturum açılamadı."); }
  };

  const closeSession = () => {
    if (todayStats?.session) setShowCloseModal(true);
  };

  const session = todayStats?.session ?? null;

  return (
    <AppShell title="Kasa">

      {/* ── Today stats bar ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
        {([
          ["Bugün Ciro",  `₺${fmt(todayStats?.totalRevenue ?? 0)}`, "#7c3aed"],
          ["Nakit",       `₺${fmt(todayStats?.totalCash    ?? 0)}`, "#16a34a"],
          ["Kart",        `₺${fmt(todayStats?.totalCard    ?? 0)}`, "#2563eb"],
          ["İşlem",       (todayStats?.txCount ?? 0).toString(),    "#d97706"],
        ] as [string, string, string][]).map(([lbl, val, color]) => (
          <div key={lbl} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #f1f5f9", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, marginBottom: 4 }}>{lbl}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color }}>{val}</div>
          </div>
        ))}

        {/* Session card */}
        <div style={{ background: session ? "#f0fdf4" : "#fff7ed", borderRadius: 12, padding: "14px 16px", border: `1px solid ${session ? "#bbf7d0" : "#fed7aa"}`, gridColumn: "span 2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, marginBottom: 2 }}>KASA OTURUMU</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: session ? "#15803d" : "#d97706" }}>
                {session
                  ? `Açık · ${new Date(session.openedAtUtc).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} · Açılış: ₺${fmt(session.openingBalance)}`
                  : "⚠ Kapalı — ödeme almak için oturum açın"}
              </div>
              {session && todayStats && (
                <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 11, color: "#374151", flexWrap: "wrap" }}>
                  <span>Ciro <b style={{ color: "#7c3aed" }}>₺{fmt(todayStats.totalRevenue)}</b></span>
                  <span>Nakit <b style={{ color: "#16a34a" }}>₺{fmt(todayStats.totalCash)}</b></span>
                  <span>Kart <b style={{ color: "#2563eb" }}>₺{fmt(todayStats.totalCard)}</b></span>
                  <span>İşlem <b>{todayStats.txCount}</b></span>
                </div>
              )}
            </div>
            <div>
              {sessionOp === "open" ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="number" placeholder="Açılış ₺" value={openingBal}
                    onChange={e => setOpeningBal(e.target.value)}
                    style={{ width: 80, padding: "6px 8px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 13 }} />
                  <button onClick={openSession} style={btnSm("#16a34a")}>Oturumu Aç</button>
                  <button onClick={() => setSessionOp(null)} style={btnSm("#94a3b8")}>İptal</button>
                </div>
              ) : (
                <button onClick={() => session ? closeSession() : setSessionOp("open")} style={{
                  fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: session ? "#fee2e2" : "#dcfce7", color: session ? "#dc2626" : "#16a34a",
                }}>
                  {session ? "🔒 Oturumu Kapat" : "🔓 Oturum Aç"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #f1f5f9", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {([["kasa","🧾 Adisyon"],["gecmis","📋 Geçmiş"],["masraf","💸 Masraf"],["ay-sonu","📊 Ay Sonu"]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "10px 16px", border: "none", background: "none", cursor: "pointer",
            fontWeight: 700, fontSize: isMobile ? 13 : 14, whiteSpace: "nowrap",
            color: tab === k ? "#7c3aed" : "#64748b",
            borderBottom: tab === k ? "2px solid #7c3aed" : "2px solid transparent",
            marginBottom: -2, flexShrink: 0,
          }}>{lbl}</button>
        ))}
      </div>

      {loading && tab === "kasa" && (
        <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
      )}
      {!loading && tab === "kasa"    && <AdisyonTab stylists={stylists} services={services} stockItems={stockItems} bankAccounts={bankAccounts} customers={customers} session={session} onCheckout={loadToday} isMobile={isMobile} />}
      {           tab === "gecmis"   && <HistoryTab />}
      {           tab === "masraf"   && <MasrafPanel bankAccounts={bankAccounts} />}
      {           tab === "ay-sonu"  && <AySonuPanel stylists={stylists} />}

      {showCloseModal && session && (
        <SessionCloseModal
          sessionId={session.id}
          onClose={() => setShowCloseModal(false)}
          onClosed={() => { setShowCloseModal(false); loadToday(); toast.success("Kasa oturumu kapatıldı."); }}
        />
      )}
    </AppShell>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ADİSYON TAB
   ════════════════════════════════════════════════════════════════════ */
function AdisyonTab({ stylists, services, stockItems, bankAccounts, customers, session, onCheckout, isMobile }: {
  stylists: Stylist[]; services: Service[]; stockItems: StockItem[]; bankAccounts: BankAccount[];
  customers: Customer[]; session: { id: string; openedAtUtc: string; openingBalance: number } | null;
  onCheckout: () => void; isMobile?: boolean;
}) {
  const { toast, confirm } = useToast();
  const [adisyons,      setAdisyons]      = useState<Adisyon[]>(() => loadAdisyons());
  const [openId,        setOpenId]        = useState<string | null>(null);
  const [activeStylist, setActiveStylist] = useState<string>(() => stylists[0]?.id ?? "");
  const [newCustomer,   setNewCustomer]   = useState<Customer | null>(null);

  useEffect(() => { saveAdisyons(adisyons); }, [adisyons]);

  useEffect(() => {
    if (stylists.length === 0) return;
    const raw = localStorage.getItem("xcut_pos_prefill");
    if (raw) {
      try {
        const p = JSON.parse(raw);
        localStorage.removeItem("xcut_pos_prefill");
        const targetStylist = p.stylistId && stylists.find((s: Stylist) => s.id === p.stylistId)
          ? p.stylistId
          : stylists[0].id;
        setActiveStylist(targetStylist);

        if (p.customerFullName) {
          const newAdisyon: Adisyon = {
            id:           uid(),
            stylistId:    targetStylist,
            customerId:   p.customerId ?? undefined,
            customerName: p.customerFullName,
            items: (p.suggestedItems ?? [])
              .filter((i: { name?: string }) => i.name)
              .flatMap((i: { serviceId?: string; name: string; unitPrice: number; quantity: number }) => {
                // Split comma-separated free-text service names into separate line items
                const names = (!i.serviceId && i.name.includes(","))
                  ? i.name.split(",").map((n: string) => n.trim()).filter(Boolean)
                  : [i.name];
                return names.map((name: string, idx: number) => {
                  const norm = (s: string) => s.toLowerCase().trim();
                  const matched = services.find(s =>
                    (idx === 0 && i.serviceId && s.id === i.serviceId) ||
                    norm(s.name) === norm(name)
                  );
                  return {
                    id:        uid(),
                    serviceId: matched?.id ?? (names.length === 1 ? (i.serviceId ?? undefined) : undefined),
                    name,
                    unitPrice: (names.length === 1 && i.unitPrice > 0) ? i.unitPrice : (matched?.price ?? 0),
                    quantity:  i.quantity ?? 1,
                  };
                });
              }),
            discountType:  "none",
            discountValue: 0,
            createdAt:     new Date().toISOString(),
          };
          setAdisyons(prev => {
            const filtered = prev.filter(a =>
              !(a.stylistId === targetStylist &&
                (a.customerId === p.customerId || a.customerName === p.customerFullName))
            );
            const updated = [...filtered, newAdisyon];
            saveAdisyons(updated);
            return updated;
          });
          setOpenId(newAdisyon.id);
        }
        return;
      } catch { /* ignore */ }
    }
    if (!activeStylist) setActiveStylist(stylists[0].id);
  }, [stylists, services]);

  const createAdisyon = () => {
    if (!newCustomer) return;
    const a: Adisyon = {
      id: uid(), stylistId: activeStylist,
      customerId:   newCustomer.id,
      customerName: newCustomer.fullName,
      items: [], discountType: "none", discountValue: 0,
      createdAt: new Date().toISOString(),
    };
    setAdisyons(prev => [...prev, a]);
    setNewCustomer(null);
    setOpenId(a.id);
  };

  const updateAdisyon = (id: string, fn: (prev: Adisyon) => Adisyon) => {
    setAdisyons(prev => prev.map(a => a.id === id ? fn(a) : a));
  };

  const deleteAdisyon = async (id: string) => {
    const ok = await confirm({ message: "Bu adisyonu silmek istediğinizden emin misiniz?", danger: true });
    if (!ok) return;
    setAdisyons(prev => prev.filter(a => a.id !== id));
    if (openId === id) setOpenId(null);
  };

  const closeAdisyon = (id: string) => {
    setAdisyons(prev => prev.filter(a => a.id !== id));
    setOpenId(null);
  };

  const openAdisyon = adisyons.find(a => a.id === openId) ?? null;
  const stylistAdisyons = adisyons.filter(a => a.stylistId === activeStylist);

  if (openAdisyon) {
    return (
      <AdisyonDetail
        adisyon={openAdisyon}
        stylist={stylists.find(s => s.id === openAdisyon.stylistId)!}
        services={services}
        stockItems={stockItems}
        bankAccounts={bankAccounts}
        session={session}
        onBack={() => setOpenId(null)}
        onUpdate={fn => updateAdisyon(openAdisyon.id, fn)}
        onCheckoutDone={() => { closeAdisyon(openAdisyon.id); onCheckout(); }}
        onDelete={() => deleteAdisyon(openAdisyon.id)}
        isMobile={isMobile}
      />
    );
  }

  /* ── Stylist buttons (shared between mobile chips and desktop sidebar) ── */
  const stylistButtons = stylists.map(s => {
    const cnt   = adisyons.filter(a => a.stylistId === s.id).length;
    const total = adisyons.filter(a => a.stylistId === s.id).reduce((sum, a) => sum + adisyonTotal(a), 0);
    const active = s.id === activeStylist;
    return (
      <button key={s.id} onClick={() => setActiveStylist(s.id)} style={isMobile ? {
        padding: "10px 14px", borderRadius: 10, flexShrink: 0,
        border: `2px solid ${active ? "#7c3aed" : "#e9d5ff"}`,
        background: active ? "#f5f3ff" : "#fff",
        cursor: "pointer", textAlign: "left", transition: "all 0.12s",
        display: "flex", alignItems: "center", gap: 8,
      } : {
        padding: "12px 14px", borderRadius: 12,
        border: `2px solid ${active ? "#7c3aed" : "#e9d5ff"}`,
        background: active ? "#f5f3ff" : "#fff",
        cursor: "pointer", textAlign: "left", transition: "all 0.12s",
      }}>
        {isMobile ? (
          <>
            <span style={{ fontWeight: 700, fontSize: 13, color: active ? "#6d28d9" : "#0f172a", whiteSpace: "nowrap" }}>{s.fullName}</span>
            {cnt > 0 && <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 999, background: "#7c3aed", color: "#fff" }}>{cnt}</span>}
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 13, color: active ? "#6d28d9" : "#0f172a" }}>{s.fullName}</div>
            {s.specialty && <div style={{ fontSize: 11, color: "#94a3b8" }}>{s.specialty}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: total > 0 ? "#7c3aed" : "#cbd5e1" }}>₺{fmt(total)}</span>
              {cnt > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 999, background: "#7c3aed", color: "#fff" }}>
                  {cnt} açık
                </span>
              )}
            </div>
          </>
        )}
      </button>
    );
  });

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Mobile: horizontal stylist chips */}
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
          <div style={{ display: "flex", gap: 8, minWidth: "max-content" }}>
            {stylistButtons}
          </div>
        </div>
        {/* Mobile: adisyon cards + new adisyon */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <CustomerPicker customers={customers} selected={newCustomer} onSelect={setNewCustomer} />
            </div>
            <button
              onClick={createAdisyon}
              disabled={!activeStylist || !newCustomer}
              style={{
                padding: "10px 14px", borderRadius: 10, border: "none", flexShrink: 0,
                background: activeStylist && newCustomer ? "#7c3aed" : "#e9d5ff",
                color: activeStylist && newCustomer ? "#fff" : "#a78bfa",
                fontWeight: 800, fontSize: 13, cursor: activeStylist && newCustomer ? "pointer" : "not-allowed",
              }}
            >
              + Yeni
            </button>
          </div>
          {stylistAdisyons.length === 0 ? (
            <div style={{ background: "#f8fafc", borderRadius: 16, padding: "40px 20px", textAlign: "center", border: "2px dashed #e9d5ff" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🪑</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#64748b", marginBottom: 5 }}>
                {stylists.find(s => s.id === activeStylist)?.fullName ?? "Bu stilist"} için açık adisyon yok
              </div>
              <div style={{ fontSize: 13, color: "#94a3b8" }}>Yukarıdan yeni adisyon açın</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {stylistAdisyons.map(a => {
                const total = adisyonTotal(a);
                const openedAt = new Date(a.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
                return (
                  <div key={a.id} style={{ background: "#fff", borderRadius: 16, border: "2px solid #e9d5ff", padding: 18, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 2px 8px rgba(124,58,237,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>{a.customerName}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Açılış: {openedAt}</div>
                      </div>
                      <button onClick={() => deleteAdisyon(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 18, lineHeight: 1 }}>×</button>
                    </div>
                    {a.items.length === 0 ? (
                      <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "8px 0" }}>Henüz kalem yok</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {a.items.slice(0, 3).map(item => (
                          <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b" }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.quantity > 1 ? `${item.quantity}× ` : ""}{item.name}</span>
                            <span style={{ fontWeight: 700, color: "#7c3aed", marginLeft: 8 }}>₺{fmt(item.unitPrice * item.quantity)}</span>
                          </div>
                        ))}
                        {a.items.length > 3 && <div style={{ fontSize: 11, color: "#94a3b8" }}>+{a.items.length - 3} kalem daha...</div>}
                      </div>
                    )}
                    <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 18, fontWeight: 900, color: "#7c3aed" }}>₺{fmt(total)}</span>
                      <button onClick={() => setOpenId(a.id)} style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: "linear-gradient(135deg, #7c3aed, #a21caf)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                        Aç →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20, minHeight: 500 }}>

      {/* Stilist sidebar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>Stilistler</div>
        {stylistButtons}
      </div>

      {/* Adisyon cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <CustomerPicker customers={customers} selected={newCustomer} onSelect={setNewCustomer} />
          <button
            onClick={createAdisyon}
            disabled={!activeStylist || !newCustomer}
            style={{
              padding: "10px 22px", borderRadius: 10, border: "none", flexShrink: 0,
              background: activeStylist && newCustomer ? "#7c3aed" : "#e9d5ff",
              color: activeStylist && newCustomer ? "#fff" : "#a78bfa",
              fontWeight: 800, fontSize: 14, cursor: activeStylist && newCustomer ? "pointer" : "not-allowed",
            }}
          >
            + Yeni Adisyon
          </button>
          {!activeStylist && <span style={{ fontSize: 12, color: "#94a3b8", paddingTop: 10 }}>Önce stilist seçin</span>}
        </div>

        {stylistAdisyons.length === 0 ? (
          <div style={{ background: "#f8fafc", borderRadius: 16, padding: "48px 24px", textAlign: "center", border: "2px dashed #e9d5ff" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🪑</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#64748b", marginBottom: 6 }}>
              {stylists.find(s => s.id === activeStylist)?.fullName ?? "Bu stilist"} için açık adisyon yok
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>Yukarıdan yeni adisyon açın</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {stylistAdisyons.map(a => {
              const total = adisyonTotal(a);
              const openedAt = new Date(a.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={a.id} style={{
                  background: "#fff", borderRadius: 16, border: "2px solid #e9d5ff",
                  padding: 18, display: "flex", flexDirection: "column", gap: 12,
                  boxShadow: "0 2px 8px rgba(124,58,237,0.06)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{a.customerName}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Açılış: {openedAt}</div>
                    </div>
                    <button onClick={() => deleteAdisyon(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 18, lineHeight: 1 }}>×</button>
                  </div>

                  {a.items.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "8px 0" }}>Henüz kalem yok</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {a.items.slice(0, 4).map(item => (
                        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.quantity > 1 ? `${item.quantity}× ` : ""}{item.name}</span>
                          <span style={{ fontWeight: 700, color: "#7c3aed", marginLeft: 8 }}>₺{fmt(item.unitPrice * item.quantity)}</span>
                        </div>
                      ))}
                      {a.items.length > 4 && (
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>+{a.items.length - 4} kalem daha...</div>
                      )}
                    </div>
                  )}

                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{a.items.length} kalem · </span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: "#7c3aed" }}>₺{fmt(total)}</span>
                    </div>
                    <button onClick={() => setOpenId(a.id)} style={{
                      padding: "8px 18px", borderRadius: 9, border: "none",
                      background: "linear-gradient(135deg, #7c3aed, #a21caf)",
                      color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
                    }}>
                      Aç →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CUSTOMER PICKER
   ════════════════════════════════════════════════════════════════════ */
function CustomerPicker({ customers, selected, onSelect }: {
  customers: Customer[];
  selected: Customer | null;
  onSelect: (c: Customer | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open,  setOpen]  = useState(false);

  const filtered = query.trim()
    ? customers.filter(c =>
        c.fullName.toLowerCase().includes(query.toLowerCase()) ||
        (c.phone ?? "").includes(query)
      ).slice(0, 10)
    : customers.slice(0, 8);

  if (selected) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, border: "2px solid #7c3aed", background: "#faf5ff", width: "100%", boxSizing: "border-box" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.fullName}</div>
          {selected.phone && <div style={{ fontSize: 11, color: "#94a3b8" }}>{selected.phone}</div>}
        </div>
        <button onClick={() => { onSelect(null); setQuery(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 20, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        placeholder="Müşteri ara..."
        style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e9d5ff", fontSize: 14, outline: "none", boxSizing: "border-box" }}
      />
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", borderRadius: 10, border: "1px solid #e9d5ff", boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 100, maxHeight: 240, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "12px 14px", color: "#94a3b8", fontSize: 13 }}>Müşteri bulunamadı</div>
          ) : filtered.map(c => (
            <button
              key={c.id}
              onMouseDown={() => { onSelect(c); setQuery(""); setOpen(false); }}
              style={{ display: "block", width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", borderBottom: "1px solid #f8fafc" }}
              onMouseOver={e => (e.currentTarget as HTMLElement).style.background = "#faf5ff"}
              onMouseOut={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{c.fullName}</div>
              {c.phone && <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.phone}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ADİSYON DETAIL
   ════════════════════════════════════════════════════════════════════ */
function AdisyonDetail({ adisyon, stylist, services, stockItems, bankAccounts, session, onBack, onUpdate, onCheckoutDone, onDelete, isMobile }: {
  adisyon:        Adisyon;
  stylist:        Stylist;
  services:       Service[];
  stockItems:     StockItem[];
  bankAccounts:   BankAccount[];
  session:        { id: string; openedAtUtc: string; openingBalance: number } | null;
  onBack:         () => void;
  onUpdate:       (fn: (prev: Adisyon) => Adisyon) => void;
  onCheckoutDone: () => void;
  onDelete:       () => void;
  isMobile?:      boolean;
}) {
  const { toast } = useToast();
  const [search,       setSearch]       = useState("");
  const [catalogTab,   setCatalogTab]   = useState<"services"|"stock"|"packages">("services");
  const [packages,     setPackages]     = useState<Array<{ id:string; name:string; totalPrice:number; isActive:boolean; validTo?:string; items:Array<{itemName:string}> }>>([]);
  const [mobilePanel,  setMobilePanel]  = useState<"catalog"|"cart">("catalog");
  const [showPay,      setShowPay]      = useState(false);
  const [payMethod,   setPayMethod]   = useState<"cash"|"card"|"mixed"|"bank">("cash");
  const [cashAmt,     setCashAmt]     = useState(0);
  const [cardAmt,     setCardAmt]     = useState(0);
  const [bankId,      setBankId]      = useState("");
  const [processing,  setProcessing]  = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeFlash, setBarcodeFlash] = useState<"ok"|"err"|null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [receiptModal, setReceiptModal] = useState<{
    total: number; discountAmount: number; payMethodLabel: string;
    customerEmail: string; salonName: string; sending: boolean;
    invoiceId?: string;
  } | null>(null);

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.category.toLowerCase().includes(search.toLowerCase())
  );
  const cats = Array.from(new Set(filtered.map(s => s.category)));

  const addService = (svc: Service) => {
    onUpdate(prev => ({
      ...prev,
      items: [...prev.items, { id: uid(), serviceId: svc.id, name: svc.name, unitPrice: svc.price, quantity: 1 }],
    }));
  };

  const addPackage = (pkg: { id:string; name:string; totalPrice:number }) => {
    onUpdate(prev => ({
      ...prev,
      items: [...prev.items, { id: uid(), name: `📦 ${pkg.name}`, unitPrice: pkg.totalPrice, quantity: 1 }],
    }));
  };

  useEffect(() => {
    apiFetch("/Packages?activeOnly=true").then(r=>r.json()).then(d => setPackages(Array.isArray(d)?d:[])).catch(()=>{});
  }, []);

  const addStockItem = (item: StockItem) => {
    onUpdate(prev => ({
      ...prev,
      items: [...prev.items, { id: uid(), stockItemId: item.id, name: item.name, unitPrice: item.salePrice, quantity: 1, staffBonusPct: item.staffBonusPct }],
    }));
  };

  const handleBarcodeSubmit = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setBarcodeInput("");

    const found = stockItems.find(si => si.barcode && si.barcode.toLowerCase() === code.toLowerCase());
    if (!found) {
      setBarcodeFlash("err");
      setTimeout(() => setBarcodeFlash(null), 700);
      toast.error(`Barkod bulunamadı: ${code}`);
      return;
    }

    if (found.quantity <= 0) {
      toast.warning(`${found.name} — stok tükenmiş, yine de eklendi.`);
    }

    const existing = adisyon.items.find(i => i.stockItemId === found.id);
    if (existing) {
      onUpdate(prev => ({
        ...prev,
        items: prev.items.map(i => i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i),
      }));
      toast.success(`${found.name} ×${existing.quantity + 1}`);
    } else {
      addStockItem(found);
      toast.success(`${found.name} adisyona eklendi`);
    }

    setBarcodeFlash("ok");
    setTimeout(() => setBarcodeFlash(null), 500);
    barcodeRef.current?.focus();
  };

  const addCustom = () => {
    onUpdate(prev => ({
      ...prev,
      items: [...prev.items, { id: uid(), name: "Özel Kalem", unitPrice: 0, quantity: 1 }],
    }));
  };

  const updateItem = (id: string, field: "name" | "unitPrice" | "quantity", val: string | number) => {
    onUpdate(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === id ? { ...i, [field]: field === "name" ? val : Number(val) || 0 } : i),
    }));
  };

  const removeItem = (id: string) => {
    onUpdate(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
  };

  const subtotal = adisyon.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discountAmount = adisyon.discountType === "percent" ? Math.round(subtotal * adisyon.discountValue) / 100
    : adisyon.discountType === "fixed" ? Math.min(adisyon.discountValue, subtotal) : 0;
  const total = Math.max(0, subtotal - discountAmount);

  const checkout = async () => {
    setProcessing(true);
    const res = await apiFetch("/Pos/checkout", {
      method: "POST",
      body: JSON.stringify({
        stylistId:    adisyon.stylistId || null,
        customerId:   adisyon.customerId ?? null,
        customerName: adisyon.customerName || null,
        items:        adisyon.items.map(i => ({
          serviceId:    i.serviceId   ?? null,
          stockItemId:  i.stockItemId ?? null,
          staffBonusPct: i.staffBonusPct ?? 0,
          name:         i.name,
          unitPrice:    i.unitPrice,
          quantity:     i.quantity,
        })),
        discountType:  adisyon.discountType,
        discountValue: adisyon.discountValue,
        paymentMethod: payMethod,
        cashAmount:    payMethod === "cash" ? total : payMethod === "mixed" ? cashAmt : 0,
        cardAmount:    payMethod === "card" ? total : payMethod === "mixed" ? cardAmt : 0,
        bankAccountId: (payMethod === "card" || payMethod === "bank") ? (bankId || null) : null,
        bankAmount:    payMethod === "bank" ? total : 0,
        notes: null,
      }),
    });
    setProcessing(false);
    if (res.ok) {
      const data = await res.json();
      toast.success(`₺${fmt(data.total)} ödeme alındı${adisyon.customerName ? ` — ${adisyon.customerName}` : ""}`);

      // Fetch customer email + salon name, then show receipt modal
      let customerEmail = "";
      let salonName = "";
      try {
        const [meRes, custRes] = await Promise.all([
          apiFetch("/Auth/me"),
          adisyon.customerId ? apiFetch(`/Customers/${adisyon.customerId}`) : Promise.resolve(null),
        ]);
        if (meRes.ok) { const me = await meRes.json(); salonName = me.salonName ?? ""; }
        if (custRes?.ok) { const c = await custRes.json(); customerEmail = c.email ?? ""; }
      } catch { /* ignore */ }

      const PM_MAP: Record<string, string> = { cash: "Nakit", card: "Kart", mixed: "Karma", bank: "Havale" };
      setReceiptModal({
        total: data.total,
        discountAmount: data.discountAmount ?? 0,
        payMethodLabel: PM_MAP[payMethod] ?? payMethod,
        customerEmail,
        salonName,
        sending: false,
        invoiceId: data.invoiceId,
      });
    } else {
      toast.error("Ödeme alınamadı. Lütfen tekrar deneyin.");
    }
  };

  const openedAt = new Date(adisyon.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

  const sendReceipt = async (email: string) => {
    if (!email.trim()) { onCheckoutDone(); return; }
    setReceiptModal(prev => prev ? { ...prev, sending: true } : null);
    try {
      await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: "receipt",
          to: email.trim(),
          subject: `${receiptModal!.salonName || "Salon"} — Adisyon`,
          data: {
            customerName: adisyon.customerName,
            salonName: receiptModal!.salonName,
            total: receiptModal!.total,
            discountAmount: receiptModal!.discountAmount,
            paymentMethod: receiptModal!.payMethodLabel,
            itemsJson: JSON.stringify(adisyon.items.map(i => ({ name: i.name, qty: i.quantity, price: i.unitPrice }))),
          },
        }),
      });
      toast.success("Adisyon e-posta ile gönderildi.");
    } catch { toast.error("E-posta gönderilemedi."); }
    onCheckoutDone();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: isMobile ? "auto" : "calc(100vh - 260px)", minHeight: isMobile ? 0 : 520 }}>

      {receiptModal && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 600 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 601, background: "#fff", borderRadius: 20, padding: 32, width: "min(420px,92vw)", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: "#166534", marginBottom: 4 }}>Ödeme Alındı!</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#1d4ed8" }}>₺{fmt(receiptModal.total)}</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{receiptModal.payMethodLabel} — {adisyon.customerName}</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: "#344054" }}>Makbuzu e-posta ile gönder</div>
            <input
              value={receiptModal.customerEmail}
              onChange={e => setReceiptModal(prev => prev ? { ...prev, customerEmail: e.target.value } : null)}
              placeholder="musteri@email.com (isteğe bağlı)"
              type="email"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box", marginBottom: 16, outline: "none" }}
            />
            {receiptModal.invoiceId && (
              <button
                onClick={() => window.open(`/finance/print/${receiptModal.invoiceId}`, "_blank")}
                style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "1px solid #2563eb", background: "#eff6ff", color: "#2563eb", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>
                🖨 Fatura Yazdır / PDF
              </button>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setReceiptModal(null); onCheckoutDone(); }}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 600, fontSize: 14, cursor: "pointer", color: "#64748b" }}>
                Atla
              </button>
              <button onClick={() => sendReceipt(receiptModal.customerEmail)} disabled={receiptModal.sending}
                style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: receiptModal.sending ? "#a78bfa" : "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 14, cursor: receiptModal.sending ? "not-allowed" : "pointer" }}>
                {receiptModal.sending ? "Gönderiliyor..." : "📧 Makbuz Gönder"}
              </button>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid #e9d5ff", background: "#fff", color: "#7c3aed", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
          ← Geri
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 900, fontSize: isMobile ? 15 : 17 }}>{adisyon.customerName}</span>
          {!isMobile && <span style={{ color: "#94a3b8", fontSize: 13, marginLeft: 8 }}>— {stylist?.fullName ?? ""} · {openedAt}</span>}
        </div>
        <button onClick={onDelete} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fef2f2", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
          {isMobile ? "İptal" : "Adisyonu İptal Et"}
        </button>
      </div>

      {/* Mobile panel switcher */}
      {isMobile && (
        <div style={{ display: "flex", gap: 0, borderRadius: 10, border: "1px solid #e9d5ff", overflow: "hidden" }}>
          <button onClick={() => setMobilePanel("catalog")} style={{ flex: 1, padding: "10px 0", border: "none", background: mobilePanel === "catalog" ? "#7c3aed" : "#fff", color: mobilePanel === "catalog" ? "#fff" : "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer", borderRight: "1px solid #e9d5ff" }}>
            📋 Katalog
          </button>
          <button onClick={() => setMobilePanel("cart")} style={{ flex: 1, padding: "10px 0", border: "none", background: mobilePanel === "cart" ? "#7c3aed" : "#fff", color: mobilePanel === "cart" ? "#fff" : "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer", position: "relative" }}>
            🛒 Sepet {adisyon.items.length > 0 && <span style={{ marginLeft: 4, padding: "1px 6px", borderRadius: 999, background: mobilePanel === "cart" ? "rgba(255,255,255,0.3)" : "#7c3aed", color: "#fff", fontSize: 11, fontWeight: 800 }}>{adisyon.items.length}</span>}
          </button>
        </div>
      )}

      <div style={isMobile ? { display: "flex", flexDirection: "column", gap: 16 } : { display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, flex: 1, overflow: "hidden" }}>

        {/* Catalog */}
        <div style={{ display: isMobile && mobilePanel === "cart" ? "none" : "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>

          {/* Barcode / QR scanner input */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, pointerEvents: "none", userSelect: "none" }}>
                📷
              </span>
              <input
                ref={barcodeRef}
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleBarcodeSubmit(barcodeInput); }}
                placeholder="Barkod / QR okut veya yaz, Enter'a bas..."
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "9px 14px 9px 34px", borderRadius: 10, fontSize: 13, outline: "none",
                  border: `2px solid ${barcodeFlash === "ok" ? "#16a34a" : barcodeFlash === "err" ? "#dc2626" : "#d1d5db"}`,
                  background: barcodeFlash === "ok" ? "#f0fdf4" : barcodeFlash === "err" ? "#fef2f2" : "#fff",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              />
            </div>
            <button
              onClick={() => handleBarcodeSubmit(barcodeInput)}
              disabled={!barcodeInput.trim()}
              style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: barcodeInput.trim() ? "#7c3aed" : "#e9d5ff", color: "#fff", fontWeight: 700, fontSize: 13, cursor: barcodeInput.trim() ? "pointer" : "default", flexShrink: 0 }}
            >
              Ekle
            </button>
          </div>

          <div style={{ display: "flex", gap: 0, borderRadius: 10, border: "1px solid #e9d5ff", overflow: "hidden", flexShrink: 0 }}>
            {(["services","stock","packages"] as const).map((t, i) => (
              <button key={t} onClick={() => setCatalogTab(t)} style={{
                flex: 1, padding: "8px 0", border: "none",
                background: catalogTab === t ? "#7c3aed" : "#fff",
                color: catalogTab === t ? "#fff" : "#64748b",
                fontWeight: 700, fontSize: 12, cursor: "pointer",
                borderRight: i < 2 ? "1px solid #e9d5ff" : "none",
              }}>
                {t === "services" ? "💇 Hizmetler" : t === "stock" ? "📦 Stok" : "🎁 Paketler"}
              </button>
            ))}
          </div>

          {catalogTab !== "packages" && (
            <input
              placeholder={catalogTab === "services" ? "🔍 Hizmet ara..." : "🔍 Ürün ara veya barkod gir..."}
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, outline: "none" }}
            />
          )}

          <div style={{ overflowY: "auto", flex: isMobile ? undefined : 1, maxHeight: isMobile ? "50vh" : undefined }}>
            {catalogTab === "packages" ? (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px,1fr))", gap:7 }}>
                {packages.length === 0 && <div style={{ color:"#94a3b8",fontSize:14,textAlign:"center",paddingTop:40,gridColumn:"1/-1" }}>Aktif paket bulunamadı</div>}
                {packages.filter(p => p.isActive && (!p.validTo || new Date(p.validTo) > new Date())).map(pkg => (
                  <button key={pkg.id} onClick={() => addPackage(pkg)} style={{
                    padding:"11px 13px", borderRadius:10, border:"1px solid #fde68a",
                    background:"#fffbeb", cursor:"pointer", textAlign:"left",
                  }}
                    onMouseOver={e=>{ const el=e.currentTarget as HTMLElement; el.style.background="#fef3c7"; el.style.borderColor="#f59e0b"; }}
                    onMouseOut={e=>{ const el=e.currentTarget as HTMLElement; el.style.background="#fffbeb"; el.style.borderColor="#fde68a"; }}
                  >
                    <div style={{ fontWeight:700, fontSize:12, color:"#0f172a", marginBottom:3 }}>🎁 {pkg.name}</div>
                    <div style={{ fontSize:14, fontWeight:900, color:"#d97706" }}>₺{pkg.totalPrice.toLocaleString("tr-TR")}</div>
                    <div style={{ fontSize:10, color:"#92400e", marginTop:2 }}>{pkg.items.map(i=>i.itemName).join(", ")}</div>
                  </button>
                ))}
              </div>
            ) : catalogTab === "services" ? (
              <>
                {cats.map(cat => (
                  <div key={cat} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>{cat}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 7 }}>
                      {filtered.filter(s => s.category === cat).map(svc => (
                        <button key={svc.id} onClick={() => addService(svc)} style={{
                          padding: "11px 13px", borderRadius: 10, border: "1px solid #e9d5ff",
                          background: "#faf5ff", cursor: "pointer", textAlign: "left",
                        }}
                          onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.background = "#f3e8ff"; el.style.borderColor = "#7c3aed"; }}
                          onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.background = "#faf5ff"; el.style.borderColor = "#e9d5ff"; }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 12, color: "#0f172a", marginBottom: 3 }}>{svc.name}</div>
                          <div style={{ fontSize: 14, fontWeight: 900, color: "#7c3aed" }}>₺{fmt(svc.price)}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {cats.length === 0 && <div style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", paddingTop: 40 }}>Hizmet bulunamadı</div>}
              </>
            ) : (
              <>
                {(() => {
                  const filteredStock = stockItems.filter(si =>
                    si.name.toLowerCase().includes(search.toLowerCase()) ||
                    (si.category ?? "").toLowerCase().includes(search.toLowerCase()) ||
                    (si.barcode ?? "").toLowerCase().includes(search.toLowerCase())
                  );
                  const stockCats = Array.from(new Set(filteredStock.map(si => si.category ?? "Genel")));
                  if (filteredStock.length === 0) return <div style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", paddingTop: 40 }}>Stok ürünü bulunamadı</div>;
                  return stockCats.map(cat => (
                    <div key={cat} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>{cat}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 7 }}>
                        {filteredStock.filter(si => (si.category ?? "Genel") === cat).map(si => (
                          <button key={si.id} onClick={() => addStockItem(si)} disabled={si.quantity <= 0} style={{
                            padding: "11px 13px", borderRadius: 10, border: "1px solid #e9d5ff",
                            background: si.quantity <= 0 ? "#f8fafc" : "#faf5ff",
                            cursor: si.quantity <= 0 ? "not-allowed" : "pointer", textAlign: "left", opacity: si.quantity <= 0 ? 0.5 : 1,
                          }}
                            onMouseOver={e => { if (si.quantity > 0) { const el = e.currentTarget as HTMLElement; el.style.background = "#f3e8ff"; el.style.borderColor = "#7c3aed"; } }}
                            onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.background = si.quantity <= 0 ? "#f8fafc" : "#faf5ff"; el.style.borderColor = "#e9d5ff"; }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 12, color: "#0f172a", marginBottom: 3 }}>{si.name}</div>
                            <div style={{ fontSize: 14, fontWeight: 900, color: "#7c3aed" }}>₺{fmt(si.salePrice)}</div>
                            <div style={{ fontSize: 10, color: si.quantity <= 0 ? "#ef4444" : "#64748b", marginTop: 2 }}>
                              {si.quantity <= 0 ? "Stok yok" : `Stok: ${si.quantity}${si.unit ? ` ${si.unit}` : ""}`}
                              {si.staffBonusPct > 0 && ` · %${si.staffBonusPct} prim`}
                            </div>
                            {si.barcode && (
                              <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 1, fontFamily: "monospace" }}>
                                {si.barcode}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </>
            )}
          </div>
        </div>

        {/* Adisyon detail panel */}
        <div style={{ display: isMobile && mobilePanel === "catalog" ? "none" : "flex", flexDirection: "column", gap: 10, background: "#fff", borderRadius: 16, padding: 18, border: "1px solid #e9d5ff", overflowY: "auto" }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#7c3aed" }}>Kalemler</div>
            <button onClick={addCustom} style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", background: "#f5f3ff", border: "1px solid #e9d5ff", borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}>
              + Özel
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 60, display: "flex", flexDirection: "column", gap: 4 }}>
            {adisyon.items.length === 0 ? (
              <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Sol taraftan hizmet seçin</div>
            ) : (
              adisyon.items.map(item => (
                <div key={item.id} style={{ background: "#faf5ff", borderRadius: 9, padding: "8px 10px", border: "1px solid #f3e8ff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <input value={item.name} onChange={e => updateItem(item.id, "name", e.target.value)}
                      style={{ flex: 1, fontSize: 12, fontWeight: 600, border: "none", background: "transparent", outline: "none", minWidth: 0 }} />
                    <span style={{ fontSize: 11, color: "#94a3b8", marginRight: 2 }}>₺</span>
                    <input type="number" min="0" value={item.unitPrice || ""}
                      onChange={e => updateItem(item.id, "unitPrice", e.target.value)}
                      style={{ width: 56, fontSize: 12, fontWeight: 700, color: "#7c3aed", border: "1px solid #e9d5ff", borderRadius: 5, padding: "2px 4px", textAlign: "right" }} />
                    <button onClick={() => updateItem(item.id, "quantity", Math.max(1, item.quantity - 1))} style={qtyBtn}>−</button>
                    <span style={{ fontSize: 12, fontWeight: 700, minWidth: 14, textAlign: "center" }}>{item.quantity}</span>
                    <button onClick={() => updateItem(item.id, "quantity", item.quantity + 1)} style={qtyBtn}>+</button>
                    <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 16, padding: 0 }}>×</button>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "right", marginTop: 2 }}>
                    = ₺{fmt(item.unitPrice * item.quantity)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Discount */}
          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5 }}>İSKONTO</div>
            <div style={{ display: "flex", gap: 5 }}>
              {(["none","percent","fixed"] as const).map(type => (
                <button key={type} onClick={() => onUpdate(p => ({ ...p, discountType: type, discountValue: 0 }))} style={{
                  padding: "4px 10px", borderRadius: 7, border: "1px solid",
                  borderColor: adisyon.discountType === type ? "#7c3aed" : "#e2e8f0",
                  background: adisyon.discountType === type ? "#f5f3ff" : "#fff",
                  color: adisyon.discountType === type ? "#7c3aed" : "#64748b",
                  fontWeight: 700, fontSize: 11, cursor: "pointer",
                }}>
                  {type === "none" ? "Yok" : type === "percent" ? "%" : "₺"}
                </button>
              ))}
              {adisyon.discountType !== "none" && (
                <input type="number" min="0" max={adisyon.discountType === "percent" ? 100 : subtotal}
                  value={adisyon.discountValue || ""}
                  onChange={e => onUpdate(p => ({ ...p, discountValue: parseFloat(e.target.value) || 0 }))}
                  style={{ width: 64, padding: "4px 8px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 12 }} />
              )}
            </div>
          </div>

          {/* Totals */}
          <div style={{ background: "#f8fafc", borderRadius: 11, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 2 }}>
              <span>Ara Toplam</span><span>₺{fmt(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#16a34a", marginBottom: 2 }}>
                <span>İskonto</span><span>−₺{fmt(discountAmount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900 }}>
              <span>Toplam</span><span style={{ color: "#7c3aed" }}>₺{fmt(total)}</span>
            </div>
          </div>

          {/* Payment section */}
          {!session && (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, fontWeight: 600, color: "#92400e", textAlign: "center" }}>
              ⚠ Kasa oturumu kapalı — ödeme alamazsınız
            </div>
          )}
          {!showPay ? (
            <button
              onClick={() => { if (adisyon.items.length > 0 && session) { setPayMethod("cash"); setCashAmt(0); setCardAmt(0); setBankId(""); setShowPay(true); } }}
              disabled={adisyon.items.length === 0 || !session}
              style={{
                padding: "13px", borderRadius: 12, border: "none",
                background: adisyon.items.length === 0 || !session ? "#e9d5ff" : "linear-gradient(135deg, #7c3aed, #a21caf)",
                color: adisyon.items.length === 0 || !session ? "#a78bfa" : "#fff",
                fontWeight: 900, fontSize: 15, cursor: adisyon.items.length === 0 || !session ? "not-allowed" : "pointer",
              }}
            >
              💳 Ödeme Al · ₺{fmt(total)}
            </button>
          ) : (
            <div style={{ background: "#f8fafc", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b" }}>ÖDEME YÖNTEMİ</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {([["cash","💵 Nakit"],["card","💳 Kart"],["mixed","↔ Karma"],["bank","🏦 Havale"]] as const).map(([m, lbl]) => (
                  <button key={m} onClick={() => setPayMethod(m)} style={{
                    padding: "6px 10px", borderRadius: 8, border: "1px solid",
                    borderColor: payMethod === m ? "#7c3aed" : "#e2e8f0",
                    background: payMethod === m ? "#7c3aed" : "#fff",
                    color: payMethod === m ? "#fff" : "#344054",
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}>{lbl}</button>
                ))}
              </div>

              {payMethod === "mixed" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 3 }}>NAKİT ₺</div>
                    <input type="number" min="0" max={total} value={cashAmt || ""}
                      onChange={e => { const v = parseFloat(e.target.value)||0; setCashAmt(v); setCardAmt(Math.max(0, total-v)); }}
                      style={smallInput} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 3 }}>KART ₺</div>
                    <input type="number" min="0" max={total} value={cardAmt || ""}
                      onChange={e => { const v = parseFloat(e.target.value)||0; setCardAmt(v); setCashAmt(Math.max(0, total-v)); }}
                      style={smallInput} />
                  </div>
                </div>
              )}

              {(payMethod === "card" || payMethod === "bank") && bankAccounts.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 3 }}>
                    {payMethod === "card" ? "POS TERMİNALİ" : "BANKA HESABI"}
                  </div>
                  <select value={bankId} onChange={e => setBankId(e.target.value)} style={{ width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12, background: "#fff" }}>
                    <option value="">Seçin (isteğe bağlı)</option>
                    {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.bankName} — {b.accountName}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                <button onClick={() => setShowPay(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>İptal</button>
                <button onClick={checkout} disabled={processing} style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: processing ? "#a78bfa" : "#16a34a", color: "#fff", fontWeight: 800, fontSize: 14, cursor: processing ? "not-allowed" : "pointer" }}>
                  {processing ? "İşleniyor..." : `✓ ₺${fmt(total)} Al`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   GEÇMİŞ TAB
   ════════════════════════════════════════════════════════════════════ */
function HistoryTab() {
  const [items,    setItems]    = useState<HistoryItem[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState("");
  const [pmFilter, setPmFilter] = useState("");
  const PAGE_SIZE = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const r = await apiFetch(`/Pos/history?page=${p}&pageSize=${PAGE_SIZE}`);
    if (r.ok) { const d = await r.json(); setItems(d.items); setTotal(d.total); }
    setLoading(false);
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  const filtered = items.filter(item => {
    const matchSearch = !search ||
      (item.customerName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (item.stylistName  ?? "").toLowerCase().includes(search.toLowerCase());
    const matchPm = !pmFilter || item.paymentMethod === pmFilter;
    return matchSearch && matchPm;
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Müşteri / stilist ara..."
          style={{ ...inputSt, width: 240 }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["","cash","card","mixed","bank"] as const).map(pm => (
            <button key={pm} onClick={() => setPmFilter(pm)} style={{
              padding: "7px 12px", borderRadius: 8, border: "1px solid", fontSize: 12, fontWeight: 700, cursor: "pointer",
              borderColor: pmFilter === pm ? "#7c3aed" : "#e2e8f0",
              background: pmFilter === pm ? "#7c3aed" : "#fff",
              color: pmFilter === pm ? "#fff" : "#64748b",
            }}>
              {pm === "" ? "Tümü" : PM_LABELS[pm] ?? pm}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "#94a3b8" }}>{total} işlem</div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: 16, border: "2px dashed #e9d5ff" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontWeight: 700 }}>İşlem bulunamadı</div>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#faf5ff" }}>
                  {["Tarih / Saat","Müşteri","Stilist","Ödeme","İndirim","Toplam","Kalem"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => (
                  <tr key={item.id} style={{ borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}
                    onMouseOver={e => (e.currentTarget as HTMLElement).style.background = "#faf5ff"}
                    onMouseOut={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                  >
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "#64748b", fontSize: 12 }}>
                      {new Date(item.createdAtUtc).toLocaleDateString("tr-TR")}<br />
                      <span style={{ color: "#94a3b8" }}>{new Date(item.createdAtUtc).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{item.customerName ?? <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td style={{ padding: "10px 14px", color: "#64748b" }}>{item.stylistName ?? <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 6, background: "#f5f3ff", color: "#7c3aed", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>
                        {PM_LABELS[item.paymentMethod] ?? item.paymentMethod}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: item.discountAmount > 0 ? "#16a34a" : "#94a3b8", fontWeight: item.discountAmount > 0 ? 700 : 400, fontSize: 13 }}>
                      {item.discountAmount > 0 ? `−₺${fmt(item.discountAmount)}` : "—"}
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 900, color: "#7c3aed", fontSize: 16, whiteSpace: "nowrap" }}>₺{fmt(item.total)}</td>
                    <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 12 }}>{item.itemCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{
            padding: "7px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff",
            cursor: page === 1 ? "not-allowed" : "pointer",
            color: page === 1 ? "#cbd5e1" : "#344054", fontWeight: 700, fontSize: 13,
          }}>← Önceki</button>
          <span style={{ fontSize: 13, color: "#64748b" }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{
            padding: "7px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff",
            cursor: page === totalPages ? "not-allowed" : "pointer",
            color: page === totalPages ? "#cbd5e1" : "#344054", fontWeight: 700, fontSize: 13,
          }}>Sonraki →</button>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MASRAF PANEL
   ════════════════════════════════════════════════════════════════════ */
function MasrafPanel({ bankAccounts }: { bankAccounts: BankAccount[] }) {
  const { toast, confirm } = useToast();
  const [expenses,    setExpenses]    = useState<Expense[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const [description, setDescription] = useState("");
  const [category,    setCategory]    = useState("Genel");
  const [amount,      setAmount]      = useState("");
  const [payMethod,   setPayMethod]   = useState<"cash"|"card"|"bank">("cash");
  const [bankId,      setBankId]      = useState("");
  const [notes,       setNotes]       = useState("");
  const [saving,      setSaving]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/Pos/expenses?pageSize=50");
      if (r.ok) { const d = await r.json(); setExpenses(d.items ?? d); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) return;
    setSaving(true);
    const r = await apiFetch("/Pos/expenses", {
      method: "POST",
      body: JSON.stringify({
        description, category, amount: parseFloat(amount),
        paymentMethod: payMethod,
        bankAccountId: payMethod === "bank" ? (bankId || null) : null,
        notes: notes || null,
      }),
    });
    setSaving(false);
    if (r.ok) {
      toast.success("Masraf kaydedildi.");
      setDescription(""); setCategory("Genel"); setAmount(""); setPayMethod("cash"); setBankId(""); setNotes("");
      setShowForm(false); load();
    } else toast.error("Masraf kaydedilemedi.");
  };

  const del = async (id: string) => {
    const ok = await confirm({ message: "Bu masrafı silmek istediğinizden emin misiniz?", danger: true });
    if (!ok) return;
    await apiFetch(`/Pos/expenses/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "#64748b" }}>Gider kayıtları</div>
        <button onClick={() => setShowForm(v => !v)} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {showForm ? "✕ Kapat" : "+ Masraf Ekle"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e9d5ff", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelSt}>Açıklama *</label>
              <input value={description} onChange={e => setDescription(e.target.value)} required style={inputSt} placeholder="Masraf açıklaması" />
            </div>
            <div>
              <label style={labelSt}>Kategori</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputSt, background: "#fff" }}>
                {EXP_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>Tutar (₺) *</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required style={inputSt} placeholder="0.00" />
            </div>
            <div>
              <label style={labelSt}>Ödeme Yöntemi</label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value as "cash"|"card"|"bank")} style={{ ...inputSt, background: "#fff" }}>
                <option value="cash">💵 Nakit</option>
                <option value="card">💳 Kart</option>
                <option value="bank">🏦 Havale/EFT</option>
              </select>
            </div>
            {payMethod === "bank" && (
              <div>
                <label style={labelSt}>Banka Hesabı</label>
                <select value={bankId} onChange={e => setBankId(e.target.value)} style={{ ...inputSt, background: "#fff" }}>
                  <option value="">Hesap seçin</option>
                  {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.bankName} — {b.accountName}</option>)}
                </select>
              </div>
            )}
            <div style={{ gridColumn: payMethod === "bank" ? "auto" : "span 2" }}>
              <label style={labelSt}>Not</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} style={inputSt} placeholder="İsteğe bağlı" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>İptal</button>
            <button type="submit" disabled={saving} style={{ padding: "9px 24px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {saving ? "Kaydediliyor..." : "Masraf Ekle"}
            </button>
          </div>
        </form>
      )}

      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
        ) : expenses.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Masraf kaydı bulunamadı.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#faf5ff" }}>
                {["Açıklama","Kategori","Ödeme","Tutar","Tarih",""].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp, i) => (
                <tr key={exp.id} style={{ borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 16px", fontWeight: 600 }}>{exp.description}</td>
                  <td style={{ padding: "10px 16px", color: "#64748b" }}>{exp.category}</td>
                  <td style={{ padding: "10px 16px", fontSize: 13 }}>
                    {{ cash: "💵 Nakit", card: "💳 Kart", bank: "🏦 Havale" }[exp.paymentMethod] ?? exp.paymentMethod}
                  </td>
                  <td style={{ padding: "10px 16px", fontWeight: 800, color: "#dc2626" }}>₺{fmt(exp.amount)}</td>
                  <td style={{ padding: "10px 16px", color: "#94a3b8", fontSize: 12 }}>{new Date(exp.createdAtUtc).toLocaleDateString("tr-TR")}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <button onClick={() => del(exp.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 13, fontWeight: 600 }}>Sil</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   AY SONU PANEL
   ════════════════════════════════════════════════════════════════════ */
function AySonuPanel({ stylists }: { stylists: { id: string; fullName: string }[] }) {
  const now = new Date();
  const [year,      setYear]      = useState(now.getFullYear());
  const [month,     setMonth]     = useState(now.getMonth() + 1);
  const [summary,   setSummary]   = useState<MonthlySummary | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [editComm,  setEditComm]  = useState<Record<string, string>>({});
  const [savingComm, setSavingComm] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`/Pos/monthly-summary?year=${year}&month=${month}`);
    if (res.ok) setSummary(await res.json());
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const saveComm = async (stylistId: string) => {
    const val = parseFloat(editComm[stylistId] ?? "");
    if (isNaN(val)) return;
    setSavingComm(stylistId);
    const r = await apiFetch(`/Pos/stylists/${stylistId}/commission`, { method: "PATCH", body: JSON.stringify({ commissionRate: val }) });
    setSavingComm(null);
    if (r.ok) {
      toast.success("Komisyon oranı güncellendi.");
      setEditComm(prev => { const n = { ...prev }; delete n[stylistId]; return n; });
      load();
    } else toast.error("Güncellenemedi.");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <select value={year} onChange={e => setYear(+e.target.value)} style={{ ...inputSt, width: "auto" }}>
          {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={{ ...inputSt, width: "auto" }}>
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <button onClick={load} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #7c3aed", background: "#f5f3ff", color: "#7c3aed", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Hesapla</button>
      </div>

      {loading && <div style={{ color: "#94a3b8", fontSize: 14 }}>Yükleniyor...</div>}

      {summary && !loading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            {([
              ["Toplam Ciro",  `₺${fmt(summary.totalRevenue)}`, "#7c3aed"],
              ["Nakit",        `₺${fmt(summary.totalCash)}`,    "#16a34a"],
              ["Kart",         `₺${fmt(summary.totalCard)}`,    "#2563eb"],
              ["Havale",       `₺${fmt(summary.totalBank ?? 0)}`, "#0891b2"],
              ["İşlem Sayısı", summary.txCount.toString(),      "#d97706"],
            ] as [string, string, string][]).map(([lbl, val, color]) => (
              <div key={lbl} style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", border: "1px solid #f1f5f9" }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{lbl}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color }}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e9d5ff", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", fontWeight: 800, fontSize: 15 }}>
              Stilist Pay Dağılımı — {MONTHS[month-1]} {year}
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
                            <input type="number" min="0" max="100" value={commVal}
                              onChange={e => setEditComm(prev => ({ ...prev, [row.stylistId]: e.target.value }))}
                              style={{ width: 54, padding: "4px 6px", borderRadius: 6, border: `1px solid ${editing ? "#7c3aed" : "#e2e8f0"}`, fontSize: 13, fontWeight: 700, textAlign: "center" }} />
                            <span style={{ fontSize: 12, color: "#64748b" }}>%</span>
                            {editing && (
                              <button onClick={() => saveComm(row.stylistId)} disabled={savingComm === row.stylistId} style={{ padding: "3px 7px", borderRadius: 5, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
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
                    <tr><td colSpan={8} style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Bu ayda stiliste bağlı işlem yok.</td></tr>
                  )}
                  {summary.stylists.length > 0 && (
                    <tr style={{ borderTop: "2px solid #e9d5ff", background: "#faf5ff" }}>
                      <td style={{ padding: "12px 16px", fontWeight: 900 }}>Toplam</td>
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
          <div style={{ background: "#f0fdf4", borderRadius: 12, padding: "14px 18px", border: "1px solid #bbf7d0", fontSize: 13, color: "#15803d" }}>
            💡 Pay yüzdesini değiştirmek için tablodaki % alanını düzenleyin ve <strong>Kaydet</strong>'e tıklayın.
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SESSION CLOSE MODAL
   ════════════════════════════════════════════════════════════════════ */
function SessionCloseModal({ sessionId, onClose, onClosed }: {
  sessionId: string;
  onClose: () => void;
  onClosed: () => void;
}) {
  const { toast } = useToast();
  const [detail,   setDetail]   = useState<SessionDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [counting, setCounting] = useState("");
  const [notes,    setNotes]    = useState("");
  const [closing,  setClosing]  = useState(false);
  const [zReport,  setZReport]  = useState<(SessionHistoryItem & { openedAtUtc: string; closedAtUtc: string }) | null>(null);

  useEffect(() => {
    apiFetch("/Pos/session/current")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDetail(d); })
      .finally(() => setLoading(false));
  }, []);

  const expected = detail ? detail.openingBalance + detail.totalCash - detail.totalExpenses : 0;
  const actual   = parseFloat(counting) || 0;
  const diff     = counting !== "" ? actual - expected : null;

  const close = async () => {
    if (!detail) return;
    setClosing(true);
    const r = await apiFetch(`/Pos/session/${detail.id}/close`, {
      method: "POST",
      body: JSON.stringify({ closingBalance: counting !== "" ? actual : null, notes: notes || null }),
    });
    setClosing(false);
    if (r.ok) {
      setZReport(await r.json());
    } else {
      const d = await r.json().catch(() => ({}));
      toast.error(d.message ?? "Oturum kapatılamadı.");
    }
  };

  const statRow = (label: string, value: string, color?: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
      <span style={{ color: "#667085" }}>{label}</span>
      <span style={{ fontWeight: 700, color: color ?? "var(--text,#101828)" }}>{value}</span>
    </div>
  );

  /* ── Z-Report ── */
  if (zReport) {
    const openedAt  = new Date(zReport.openedAtUtc).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const closedAt  = new Date(zReport.closedAtUtc).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const zDiff     = zReport.difference ?? null;
    return (
      <>
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 700 }} />
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "24px 12px", zIndex: 701 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "min(480px,100%)", boxShadow: "0 24px 64px rgba(0,0,0,0.18)", marginBottom: 24 }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📊</div>
              <div style={{ fontWeight: 900, fontSize: 18, color: "#101828" }}>Z-Raporu</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{openedAt} – {closedAt}</div>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 12, padding: "8px 14px", marginBottom: 16 }}>
              {statRow("Açılış Bakiyesi",  `₺${fmt(zReport.openingBalance)}`, "#374151")}
              {statRow("Toplam Ciro",      `₺${fmt(zReport.totalRevenue)}`, "#7c3aed")}
              {statRow("Nakit Tahsilat",   `₺${fmt(zReport.totalCash)}`, "#16a34a")}
              {statRow("Kart Tahsilat",    `₺${fmt(zReport.totalCard)}`, "#2563eb")}
              {zReport.totalBank > 0 && statRow("Havale Tahsilat", `₺${fmt(zReport.totalBank)}`, "#0891b2")}
              {zReport.totalExpenses > 0 && statRow("Toplam Masraf", `−₺${fmt(zReport.totalExpenses)}`, "#dc2626")}
              {statRow("Beklenen Nakit",   `₺${fmt(zReport.netCash)}`, "#059669")}
              {zReport.closingBalance != null && statRow("Sayılan Nakit", `₺${fmt(zReport.closingBalance)}`, "#374151")}
              {zDiff !== null && statRow(
                zDiff >= 0 ? "Kasa Fazlası" : "Kasa Açığı",
                `${zDiff >= 0 ? "+" : ""}₺${fmt(Math.abs(zDiff))}`,
                zDiff >= 0 ? "#059669" : "#dc2626"
              )}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", marginBottom: 16 }}>
              {zReport.txCount} işlem tamamlandı
            </div>
            <button onClick={onClosed} style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
              Tamam
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 700 }} onClick={onClose} />
      <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "24px 12px", zIndex: 701 }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "min(480px,100%)", boxShadow: "0 24px 64px rgba(0,0,0,0.18)", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontWeight: 900, fontSize: 17, color: "#101828" }}>🔒 Kasa Oturumunu Kapat</div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#94a3b8" }}>×</button>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>Yükleniyor...</div>
          ) : !detail ? (
            <div style={{ textAlign: "center", padding: 32, color: "#dc2626" }}>Oturum bulunamadı.</div>
          ) : (
            <>
              {/* Session summary */}
              <div style={{ background: "#f8fafc", borderRadius: 12, padding: "8px 14px", marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 4 }}>OTURUM ÖZETİ</div>
                {statRow("Açılış Bakiyesi",  `₺${fmt(detail.openingBalance)}`)}
                {statRow("Toplam Ciro",      `₺${fmt(detail.totalRevenue)}`, "#7c3aed")}
                {statRow("Nakit Tahsilat",   `₺${fmt(detail.totalCash)}`, "#16a34a")}
                {statRow("Kart Tahsilat",    `₺${fmt(detail.totalCard)}`, "#2563eb")}
                {detail.totalBank > 0 && statRow("Havale", `₺${fmt(detail.totalBank)}`, "#0891b2")}
                {detail.totalExpenses > 0 && statRow("Toplam Masraf", `−₺${fmt(detail.totalExpenses)}`, "#dc2626")}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", fontSize: 14, borderTop: "2px solid #e2e8f0", marginTop: 4 }}>
                  <span style={{ fontWeight: 700, color: "#374151" }}>Beklenen Nakit</span>
                  <span style={{ fontWeight: 900, color: "#059669" }}>₺{fmt(expected)}</span>
                </div>
              </div>

              {/* Cash count */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#344054", marginBottom: 6 }}>
                  Kasa Sayımı (isteğe bağlı)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={counting}
                  onChange={e => setCounting(e.target.value)}
                  placeholder={`Beklenen: ₺${fmt(expected)}`}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box", outline: "none" }}
                />
              </div>

              {/* Difference indicator */}
              {diff !== null && (
                <div style={{
                  padding: "10px 14px", borderRadius: 10, marginBottom: 14,
                  background: Math.abs(diff) < 0.01 ? "#f0fdf4" : diff > 0 ? "#eff6ff" : "#fef3f2",
                  border: `1px solid ${Math.abs(diff) < 0.01 ? "#bbf7d0" : diff > 0 ? "#bfdbfe" : "#fecaca"}`,
                  color: Math.abs(diff) < 0.01 ? "#15803d" : diff > 0 ? "#1d4ed8" : "#b42318",
                  fontWeight: 700, fontSize: 14, display: "flex", justifyContent: "space-between",
                }}>
                  <span>{Math.abs(diff) < 0.01 ? "✓ Kasa dengede" : diff > 0 ? "↑ Kasa fazlası" : "↓ Kasa açığı"}</span>
                  <span>{diff >= 0 ? "+" : ""}₺{fmt(diff)}</span>
                </div>
              )}

              {/* Notes */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#344054", marginBottom: 6 }}>Not</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Varsa not ekleyin..."
                  rows={2}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 13, boxSizing: "border-box", resize: "none", outline: "none", fontFamily: "inherit" }}
                />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 600, fontSize: 14, cursor: "pointer", color: "#64748b" }}>
                  Vazgeç
                </button>
                <button onClick={close} disabled={closing} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: closing ? "#94a3b8" : "#dc2626", color: "#fff", fontWeight: 700, fontSize: 14, cursor: closing ? "not-allowed" : "pointer" }}>
                  {closing ? "Kapatılıyor..." : "🔒 Oturumu Kapat"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Shared styles ─────────────────────────────────────────────────── */
const labelSt: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 5,
};
const inputSt: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid #e2e8f0", fontSize: 14,
  fontFamily: "inherit", boxSizing: "border-box", outline: "none",
};
const smallInput: React.CSSProperties = {
  width: "100%", padding: "7px 9px", borderRadius: 8,
  border: "1px solid #e2e8f0", fontSize: 12, fontFamily: "inherit",
};
const qtyBtn: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 5, border: "1px solid #e9d5ff",
  background: "#f5f3ff", cursor: "pointer", fontWeight: 900,
  fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
  lineHeight: 1, padding: 0,
};
const btnSm = (bg: string): React.CSSProperties => ({
  padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
  background: bg, color: "#fff", fontWeight: 700, fontSize: 11,
});
