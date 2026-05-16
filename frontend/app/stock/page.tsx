"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

/* ── Types ─────────────────────────────────────────────────────── */
type StockItem = {
  id: string; name: string; category?: string; unit?: string;
  quantity: number; minQuantity?: number;
  unitCost?: number; salePrice?: number; staffBonusPct?: number;
  expiresAtUtc?: string; supplier?: string; barcode?: string;
  isLow?: boolean; isExpired?: boolean; expiresSoon?: boolean;
  movementsThisMonth?: number; movementsTotal?: number;
};
type Movement = {
  id: string; type: string;
  quantity: number; note?: string; userName?: string; createdAtUtc: string;
};
type Summary = {
  totalItems: number; lowStock: number; expiredItems: number;
  expireSoon: number; totalValue: number;
};
type StatRow = { id: string; movementsThisMonth: number; movementsTotal: number };

const STATUS_FILTERS = [
  { key: "",         label: "Tümü" },
  { key: "low",      label: "Düşük Stok" },
  { key: "expiring", label: "Yakın Son Kull." },
  { key: "expired",  label: "Süresi Dolmuş" },
];

/* ── Activity Badge ─────────────────────────────────────────────── */
function ActivityBadge({ n }: { n: number }) {
  if (n >= 10) return <span className="badge" style={{ background: "#dcfce7", color: "#166534", fontSize: 10 }}>Çok Hareketli</span>;
  if (n >= 3)  return <span className="badge" style={{ background: "#dbeafe", color: "#1e40af", fontSize: 10 }}>Hareketli</span>;
  if (n === 0) return <span className="badge" style={{ background: "#f1f5f9", color: "#94a3b8", fontSize: 10 }}>Durağan</span>;
  return null;
}

/* ── Page ───────────────────────────────────────────────────────── */
export default function StockPage() {
  const { toast, confirm } = useToast();
  const [items,        setItems]        = useState<StockItem[]>([]);
  const [summary,      setSummary]      = useState<Summary | null>(null);
  const [categories,   setCategories]   = useState<string[]>([]);
  const [selected,     setSelected]     = useState<StockItem | null>(null);
  const [movements,    setMovements]    = useState<Movement[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [showModal,    setShowModal]    = useState(false);
  const [editItem,     setEditItem]     = useState<StockItem | null>(null);
  const [filterCat,    setFilterCat]    = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search,       setSearch]       = useState("");
  const [showBulk,     setShowBulk]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, sRes, cRes, stRes] = await Promise.all([
        apiFetch(`/Stock?category=${filterCat}&search=${encodeURIComponent(search)}&pageSize=200`),
        apiFetch("/Stock/summary"),
        apiFetch("/Stock/categories"),
        apiFetch("/Stock/stats"),
      ]);
      const rawItems: StockItem[] = iRes.ok ? await iRes.json() : [];
      if (sRes.ok) setSummary(await sRes.json());
      if (cRes.ok) setCategories(await cRes.json());

      if (stRes.ok) {
        const stats: StatRow[] = await stRes.json();
        const map = Object.fromEntries(stats.map(s => [s.id, s]));
        setItems(rawItems.map(it => ({
          ...it,
          movementsThisMonth: map[it.id]?.movementsThisMonth ?? 0,
          movementsTotal:     map[it.id]?.movementsTotal     ?? 0,
        })));
      } else {
        setItems(rawItems);
      }
    } finally { setLoading(false); }
  }, [filterCat, search]);

  useEffect(() => { load(); }, [load]);

  const selectItem = async (item: StockItem) => {
    setSelected(item);
    const r = await apiFetch(`/Stock/${item.id}/movements`);
    if (r.ok) setMovements(await r.json());
    else setMovements([]);
  };

  const del = async (id: string) => {
    const ok = await confirm({ message: "Bu ürünü silmek istediğinizden emin misiniz?", danger: true });
    if (!ok) return;
    const r = await apiFetch(`/Stock/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Ürün silindi."); if (selected?.id === id) setSelected(null); load(); }
    else toast.error("Silinemedi.");
  };

  const visibleItems = items.filter(item => {
    if (filterStatus === "low")      return !!item.isLow && !item.isExpired;
    if (filterStatus === "expiring") return !!item.expiresSoon;
    if (filterStatus === "expired")  return !!item.isExpired;
    return true;
  });

  const catStats = categories.map(cat => {
    const ci = items.filter(i => i.category === cat);
    return { name: cat, count: ci.length, value: ci.reduce((s, i) => s + (i.unitCost ?? 0) * i.quantity, 0) };
  });

  const summaryCards = summary ? [
    { label: "Toplam Ürün",        value: summary.totalItems,   icon: "📦", color: "#7c3aed" },
    { label: "Düşük Stok",         value: summary.lowStock,     icon: "⚠️",  color: "#f59e0b" },
    { label: "Süresi Dolmuş",      value: summary.expiredItems, icon: "🗑",  color: "#ef4444" },
    { label: "Yakında Dolacak",    value: summary.expireSoon,   icon: "⏳",  color: "#0ea5e9" },
    { label: "Toplam Stok Değeri", value: `₺${summary.totalValue.toLocaleString("tr-TR")}`, icon: "💰", color: "#22c55e" },
  ] : [];

  return (
    <AppShell
      title="Stok Yönetimi"
      description="Ürün ve malzeme takibi"
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowBulk(true)} className="btn btn-ghost" style={{ fontSize: 13 }}>Toplu Fiyat</button>
          <button onClick={() => { setEditItem(null); setShowModal(true); }} className="btn btn-primary">+ Ürün Ekle</button>
        </div>
      }
    >
      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
          {summaryCards.map(c => (
            <div key={c.label} className="card" style={{ textAlign: "center", padding: "16px 12px" }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Category chips */}
      {catStats.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button
            onClick={() => setFilterCat("")}
            style={{
              padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontWeight: 700, fontSize: 12,
              border: `2px solid ${filterCat === "" ? "#7c3aed" : "var(--border,#eaecf0)"}`,
              background: filterCat === "" ? "#ede9fe" : "var(--surface,#fff)",
              color: filterCat === "" ? "#7c3aed" : "#64748b",
            }}
          >
            Tümü <span style={{ fontWeight: 400 }}>({items.length})</span>
          </button>
          {catStats.map(c => (
            <button
              key={c.name}
              onClick={() => setFilterCat(c.name === filterCat ? "" : c.name)}
              style={{
                padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontWeight: 700, fontSize: 12,
                border: `2px solid ${filterCat === c.name ? "#7c3aed" : "var(--border,#eaecf0)"}`,
                background: filterCat === c.name ? "#ede9fe" : "var(--surface,#fff)",
                color: filterCat === c.name ? "#7c3aed" : "#334155",
              }}
            >
              {c.name} <span style={{ fontWeight: 400 }}>({c.count} · ₺{c.value.toLocaleString("tr-TR", { maximumFractionDigits: 0 })})</span>
            </button>
          ))}
        </div>
      )}

      {/* Alert banners */}
      {summary && summary.lowStock > 0 && filterStatus === "" && (
        <div style={{ padding: "10px 16px", borderRadius: 10, background: "#fef3c7", border: "1px solid #fde68a", marginBottom: 10, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <span>⚠️</span>
          <span style={{ fontWeight: 700, color: "#92400e" }}>{summary.lowStock} ürün</span>
          <span style={{ color: "#78350f" }}>minimum stok seviyesinin altında.</span>
          <button onClick={() => setFilterStatus("low")} style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#7c3aed", background: "none", border: "none", cursor: "pointer" }}>Göster →</button>
        </div>
      )}
      {summary && summary.expireSoon > 0 && filterStatus === "" && (
        <div style={{ padding: "10px 16px", borderRadius: 10, background: "#e0f2fe", border: "1px solid #bae6fd", marginBottom: 10, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <span>⏳</span>
          <span style={{ fontWeight: 700, color: "#075985" }}>{summary.expireSoon} ürün</span>
          <span style={{ color: "#0c4a6e" }}>son kullanma tarihi 30 gün içinde doluyor.</span>
          <button onClick={() => setFilterStatus("expiring")} style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#7c3aed", background: "none", border: "none", cursor: "pointer" }}>Göster →</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ürün ara..." className="inp" style={{ maxWidth: 220 }} />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              style={{
                padding: "7px 13px", borderRadius: 8, border: "1px solid var(--border,#d0d5dd)", fontSize: 12, cursor: "pointer",
                background: filterStatus === f.key ? "#7c3aed" : "var(--surface,#fff)",
                color:      filterStatus === f.key ? "#fff"    : "#344054",
                fontWeight: filterStatus === f.key ? 700       : 500,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* Table */}
        <div className="card" style={{ flex: 1, padding: 0, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
              <div style={{ width: 32, height: 32, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
              Yükleniyor...
            </div>
          ) : (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 560 }}>
              <thead>
                <tr style={{ background: "var(--surface-2,#f8fafc)" }}>
                  {["Ürün", "Kategori", "Stok", "Fiyat", "Aktivite", "Durum", ""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "#64748b", borderBottom: "1px solid var(--border,#eaecf0)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleItems.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Ürün bulunamadı</td></tr>
                )}
                {visibleItems.map(item => {
                  const isActive = selected?.id === item.id;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => selectItem(item)}
                      style={{ borderBottom: "1px solid var(--border,#f2f4f7)", cursor: "pointer", background: isActive ? "#ede9fe" : "transparent" }}
                    >
                      <td style={{ padding: "11px 14px", fontWeight: 700 }}>{item.name}</td>
                      <td style={{ padding: "11px 14px", color: "#64748b", fontSize: 12 }}>{item.category ?? "—"}</td>
                      <td style={{ padding: "11px 14px", fontWeight: 700, color: item.isExpired ? "#f59e0b" : item.isLow ? "#ef4444" : "#22c55e" }}>
                        {item.quantity}<span style={{ fontWeight: 400, color: "#94a3b8", fontSize: 12 }}> {item.unit}</span>
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12 }}>
                        {item.salePrice
                          ? <><span style={{ color: "#7c3aed", fontWeight: 700 }}>₺{item.salePrice}</span><span style={{ color: "#94a3b8" }}> / ₺{item.unitCost}</span></>
                          : item.unitCost ? `₺${item.unitCost}` : "—"}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <ActivityBadge n={item.movementsThisMonth ?? 0} />
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        {item.isExpired
                          ? <span className="badge" style={{ background: "#fee2e2", color: "#991b1b" }}>Süresi Dolmuş</span>
                          : item.expiresSoon
                            ? <span className="badge" style={{ background: "#e0f2fe", color: "#075985" }}>Yakın Son Kull.</span>
                            : item.isLow
                              ? <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>Düşük</span>
                              : <span className="badge" style={{ background: "#dcfce7", color: "#166534" }}>Yeterli</span>
                        }
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={e => { e.stopPropagation(); setEditItem(item); setShowModal(true); }} className="btn btn-ghost" style={{ padding: "5px 10px", minHeight: 30, fontSize: 12 }}>Düzenle</button>
                          <button onClick={e => { e.stopPropagation(); del(item.id); }} style={{ padding: "5px 8px", minHeight: 30, borderRadius: 6, border: "1px solid #fee2e2", background: "#fef2f2", color: "#ef4444", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Sil</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card" style={{ width: 300, flexShrink: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{selected.name}</div>
            {selected.category && <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600, marginBottom: 12 }}>{selected.category}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div style={{ borderRadius: 8, background: "#ede9fe", padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#7c3aed" }}>{selected.movementsThisMonth ?? 0}</div>
                <div style={{ fontSize: 10, color: "#7c3aed" }}>Bu ay hareket</div>
              </div>
              <div style={{ borderRadius: 8, background: "#f8fafc", padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#334155" }}>{selected.movementsTotal ?? 0}</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>Toplam hareket</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13, marginBottom: 16 }}>
              {([
                ["Stok",           `${selected.quantity} ${selected.unit ?? ""}`],
                ["Min. Stok",      selected.minQuantity ?? "—"],
                ["Alış Fiyatı",    selected.unitCost   ? `₺${selected.unitCost}`   : "—"],
                ["Satış Fiyatı",   selected.salePrice  ? `₺${selected.salePrice}`  : "—"],
                ["Personel Primi", selected.staffBonusPct ? `%${selected.staffBonusPct}` : "—"],
                ["Son Kullanma",   selected.expiresAtUtc?.slice(0, 10) ?? "—"],
                ["Tedarikçi",      selected.supplier ?? "—"],
                ["Barkod",         selected.barcode  ?? "—"],
              ] as [string, string | number][]).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>{k}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>

            <QuickMovement stockId={selected.id} onDone={() => { load(); selectItem(selected); }} />

            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Hareket Geçmişi</div>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {movements.length === 0
                  ? <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 10 }}>Hareket yok</div>
                  : movements.map(m => (
                    <div key={m.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border,#f2f4f7)", fontSize: 12 }}>
                      <span className="badge" style={{
                        background: m.type === "in" ? "#dcfce7" : m.type === "out" ? "#fee2e2" : "#fef3c7",
                        color:      m.type === "in" ? "#166534" : m.type === "out" ? "#991b1b" : "#92400e",
                        fontSize: 10,
                      }}>
                        {m.type === "in" ? "Giriş" : m.type === "out" ? "Çıkış" : "Düzeltme"}
                      </span>
                      <span style={{ flex: 1 }}>{m.quantity}{m.note && ` · ${m.note}`}</span>
                      <span style={{ color: "#94a3b8" }}>{m.createdAtUtc?.slice(0, 10)}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <StockModal
          item={editItem}
          categories={categories}
          onClose={() => setShowModal(false)}
          onSaved={msg => { setShowModal(false); toast.success(msg); load(); }}
          onError={msg  => toast.error(msg)}
        />
      )}
      {showBulk && (
        <BulkPriceModal
          categories={categories}
          items={items}
          onClose={() => setShowBulk(false)}
          onSaved={msg => { setShowBulk(false); toast.success(msg); load(); }}
          onError={msg  => toast.error(msg)}
        />
      )}
    </AppShell>
  );
}

/* ── Quick Movement ─────────────────────────────────────────────── */
function QuickMovement({ stockId, onDone }: { stockId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [type,   setType]   = useState<"In" | "Out" | "Adjustment">("In");
  const [qty,    setQty]    = useState(1);
  const [note,   setNote]   = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (qty <= 0) { toast.warning("Miktar 0'dan büyük olmalıdır."); return; }
    setSaving(true);
    const r = await apiFetch(`/Stock/${stockId}/movement`, {
      method: "POST", body: JSON.stringify({ type, quantity: qty, note }),
    });
    setSaving(false);
    if (r.ok) { setQty(1); setNote(""); onDone(); }
    else toast.error("Hareket kaydedilemedi.");
  };

  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--surface-2,#f8fafc)", border: "1px solid var(--border,#eaecf0)" }}>
      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 8, color: "#344054", textTransform: "uppercase", letterSpacing: "0.5px" }}>Hızlı Hareket</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <select value={type} onChange={e => setType(e.target.value as "In" | "Out" | "Adjustment")}
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border,#d0d5dd)", fontSize: 12, background: "var(--surface,#fff)" }}>
          <option value="In">Giriş</option>
          <option value="Out">Çıkış</option>
          <option value="Adjustment">Düzeltme</option>
        </select>
        <input type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value))}
          style={{ width: 64, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border,#d0d5dd)", fontSize: 12, background: "var(--surface,#fff)" }} />
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Not..."
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border,#d0d5dd)", fontSize: 12, background: "var(--surface,#fff)" }} />
        <button onClick={save} disabled={saving} className="btn btn-primary" style={{ padding: "8px 14px", minHeight: 36, fontSize: 12 }}>
          {saving ? "..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
}

/* ── Bulk Price Modal ────────────────────────────────────────────── */
function BulkPriceModal({
  categories, items, onClose, onSaved, onError,
}: {
  categories: string[];
  items: StockItem[];
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState({ category: "", field: "salePrice", mode: "percent", amount: "" });
  const [saving, setSaving] = useState(false);

  const affected = items.filter(it =>
    (!form.category || it.category === form.category) &&
    (form.field === "salePrice" ? (it.salePrice ?? 0) > 0 : (it.unitCost ?? 0) > 0)
  );

  const previewRow = (() => {
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0 || affected.length === 0) return null;
    const base = form.field === "salePrice" ? (affected[0].salePrice ?? 0) : (affected[0].unitCost ?? 0);
    const next = form.mode === "percent"
      ? Math.round(base * (1 + amt / 100) * 100) / 100
      : Math.max(0, base + amt);
    return { base, next, count: affected.length };
  })();

  const save = async () => {
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) { onError("Geçerli bir tutar giriniz."); return; }
    setSaving(true);
    const r = await apiFetch("/Stock/bulk-price", {
      method: "POST",
      body: JSON.stringify({ category: form.category || null, field: form.field, mode: form.mode, amount: amt }),
    });
    setSaving(false);
    if (r.ok) {
      const d = await r.json();
      onSaved(`${d.updated} ürün güncellendi.`);
    } else {
      const d = await r.json().catch(() => ({}));
      onError(d.message ?? "Güncelleme hatası.");
    }
  };

  const si: React.CSSProperties = { width: "100%", padding: "11px 14px", borderRadius: 10, minHeight: 44, border: "1px solid var(--border,#d0d5dd)", fontSize: 14, background: "var(--surface,#fff)", color: "var(--text,#101828)", WebkitAppearance: "none" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, backdropFilter: "blur(3px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(440px, 94vw)", zIndex: 301, background: "var(--surface,#fff)", borderRadius: 20, boxShadow: "0 24px 64px rgba(15,23,42,0.22)", border: "1px solid var(--border,#eaecf0)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Toplu Fiyat Güncelle</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Kategori (boş = tümü)</label>
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={si}>
              <option value="">Tüm Kategoriler</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Alan</label>
              <select value={form.field} onChange={e => setForm(p => ({ ...p, field: e.target.value }))} style={si}>
                <option value="salePrice">Satış Fiyatı</option>
                <option value="unitCost">Alış Fiyatı</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Yöntem</label>
              <select value={form.mode} onChange={e => setForm(p => ({ ...p, mode: e.target.value }))} style={si}>
                <option value="percent">Yüzde (%)</option>
                <option value="fixed">Sabit Tutar (₺)</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>
              {form.mode === "percent" ? "Artış Yüzdesi (%)" : "Artış Tutarı (₺)"}
            </label>
            <input
              type="number" min={0} step={form.mode === "percent" ? 1 : 0.01}
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              placeholder={form.mode === "percent" ? "örn: 10" : "örn: 50"}
              style={si}
            />
          </div>
          {previewRow && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#ede9fe", border: "1px solid #ddd6fe" }}>
              <div style={{ fontSize: 13, color: "#5b21b6", fontWeight: 700 }}>
                Önizleme: ₺{previewRow.base} → ₺{previewRow.next}
              </div>
              <div style={{ fontSize: 12, color: "#7c3aed", marginTop: 3 }}>
                {previewRow.count} ürün etkilenecek
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>İptal</button>
            <button onClick={save} disabled={saving || !form.amount} className="btn btn-primary" style={{ flex: 2, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Güncelleniyor..." : "Güncelle"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Stock Modal ────────────────────────────────────────────────── */
function StockModal({
  item, categories, onClose, onSaved, onError,
}: {
  item: StockItem | null;
  categories: string[];
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isEdit = !!item?.id;
  const [form, setForm] = useState({
    name:          item?.name          ?? "",
    category:      item?.category      ?? "",
    unit:          item?.unit          ?? "adet",
    quantity:      item?.quantity      ?? 0,
    minQuantity:   item?.minQuantity   ?? 5,
    unitCost:      item?.unitCost      ?? 0,
    salePrice:     item?.salePrice     ?? 0,
    staffBonusPct: item?.staffBonusPct ?? 0,
    expiresAtUtc:  item?.expiresAtUtc?.slice(0, 10) ?? "",
    supplier:      item?.supplier      ?? "",
    barcode:       item?.barcode       ?? "",
  });
  const [saving, setSaving] = useState(false);

  const NUMERIC = ["quantity", "minQuantity", "unitCost", "salePrice", "staffBonusPct"];
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: NUMERIC.includes(k) ? Number(e.target.value) : e.target.value }));

  const save = async () => {
    if (!form.name.trim()) { onError("Ürün adı zorunludur."); return; }
    setSaving(true);
    try {
      const body = { ...form, expiresAtUtc: form.expiresAtUtc || null };
      const res = isEdit
        ? await apiFetch(`/Stock/${item!.id}`, { method: "PUT",  body: JSON.stringify(body) })
        : await apiFetch("/Stock",              { method: "POST", body: JSON.stringify(body) });
      if (res.ok) onSaved(isEdit ? "Ürün güncellendi." : "Ürün eklendi.");
      else { const d = await res.json().catch(() => ({})); onError(d.message ?? "Kayıt hatası."); }
    } finally { setSaving(false); }
  };

  const s: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: 10, minHeight: 44,
    border: "1px solid var(--border,#d0d5dd)", fontSize: 14,
    background: "var(--surface,#fff)", color: "var(--text,#101828)", WebkitAppearance: "none",
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, backdropFilter: "blur(3px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(520px, 94vw)", zIndex: 301, maxHeight: "92vh", overflowY: "auto", background: "var(--surface,#fff)", borderRadius: 20, boxShadow: "0 24px 64px rgba(15,23,42,0.22)", border: "1px solid var(--border,#eaecf0)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{isEdit ? "Ürün Düzenle" : "Yeni Ürün"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="form-grid">
            <div className="form-full">
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Ürün Adı *</label>
              <input value={form.name} onChange={set("name")} style={s} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Kategori</label>
              <input value={form.category} onChange={set("category")} list="cat-list" style={s} />
              <datalist id="cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Birim</label>
              <input value={form.unit} onChange={set("unit")} style={s} placeholder="adet, litre, kg..." />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Stok Miktarı</label>
              <input type="number" min={0} value={form.quantity} onChange={set("quantity")} style={s} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Minimum Stok</label>
              <input type="number" min={0} value={form.minQuantity} onChange={set("minQuantity")} style={s} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Alış Fiyatı (₺)</label>
              <input type="number" min={0} step={0.01} value={form.unitCost} onChange={set("unitCost")} style={s} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Satış Fiyatı (₺)</label>
              <input type="number" min={0} step={0.01} value={form.salePrice} onChange={set("salePrice")} style={s} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Personel Primi (%)</label>
              <input type="number" min={0} max={100} step={0.5} value={form.staffBonusPct} onChange={set("staffBonusPct")} style={s} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Son Kullanma Tarihi</label>
              <input type="date" value={form.expiresAtUtc} onChange={set("expiresAtUtc")} style={s} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Tedarikçi</label>
              <input value={form.supplier} onChange={set("supplier")} style={s} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Barkod</label>
              <input value={form.barcode} onChange={set("barcode")} style={s} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>İptal</button>
            <button onClick={save} disabled={saving} className="btn btn-primary" style={{ flex: 2, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Kaydet"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
