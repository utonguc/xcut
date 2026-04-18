"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────── */
type StockItem = {
  id: string; name: string; category?: string; unit?: string;
  quantity: number; minQuantity?: number; price?: number;
  expiryDate?: string; supplier?: string; notes?: string;
};
type Movement = {
  id: string; type: "In"|"Out"|"Adjustment";
  quantity: number; note?: string; createdAt: string;
};
type Summary = {
  totalItems: number; lowStock: number; expiredItems: number;
  expireSoon: number; totalValue: number;
};

/* ── Page ───────────────────────────────────────────────────────── */
export default function StockPage() {
  const [items,      setItems]      = useState<StockItem[]>([]);
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [selected,   setSelected]   = useState<StockItem | null>(null);
  const [movements,  setMovements]  = useState<Movement[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const [editItem,   setEditItem]   = useState<StockItem | null>(null);
  const [filterCat,  setFilterCat]  = useState("");
  const [search,     setSearch]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, sRes, cRes] = await Promise.all([
        apiFetch(`/Stock?category=${filterCat}&search=${encodeURIComponent(search)}&pageSize=200`),
        apiFetch("/Stock/summary"),
        apiFetch("/Stock/categories"),
      ]);
      if (iRes.ok) setItems(await iRes.json());
      if (sRes.ok) setSummary(await sRes.json());
      if (cRes.ok) setCategories(await cRes.json());
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
    if (!confirm("Bu ürünü silmek istediğinizden emin misiniz?")) return;
    await apiFetch(`/Stock/${id}`, { method: "DELETE" });
    if (selected?.id === id) setSelected(null);
    load();
  };

  const summaryCards = summary ? [
    { label: "Toplam Ürün",   value: summary.totalItems,  icon: "📦", color: "#7c3aed" },
    { label: "Düşük Stok",    value: summary.lowStock,    icon: "⚠️",  color: "#f59e0b" },
    { label: "Süresi Dolmuş", value: summary.expiredItems, icon: "🗑", color: "#ef4444" },
    { label: "Yakında Dolacak", value: summary.expireSoon, icon: "⏳", color: "#0ea5e9" },
    { label: "Toplam Değer",  value: `₺${summary.totalValue.toLocaleString("tr-TR")}`, icon: "💰", color: "#22c55e" },
  ] : [];

  return (
    <AppShell
      title="Stok Yönetimi"
      description="Ürün ve malzeme takibi"
      actions={
        <button onClick={() => { setEditItem(null); setShowModal(true); }} className="btn btn-primary">+ Ürün Ekle</button>
      }
    >
      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
          {summaryCards.map(c => (
            <div key={c.label} className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ürün ara..." className="inp" style={{ maxWidth: 220 }} />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="inp" style={{ width: 160 }}>
          <option value="">Tüm Kategoriler</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
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
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "var(--surface-2,#f8fafc)" }}>
                  {["Ürün","Kategori","Stok","Min. Stok","Fiyat","Durum",""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "#64748b", borderBottom: "1px solid var(--border,#eaecf0)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Ürün bulunamadı</td></tr>
                )}
                {items.map(item => {
                  const isLow = item.minQuantity !== undefined && item.quantity <= item.minQuantity;
                  const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();
                  const isActive = selected?.id === item.id;
                  return (
                    <tr key={item.id}
                      onClick={() => selectItem(item)}
                      style={{ borderBottom: "1px solid var(--border,#f2f4f7)", cursor: "pointer", background: isActive ? "#ede9fe" : "transparent" }}>
                      <td style={{ padding: "12px 14px", fontWeight: 700 }}>{item.name}</td>
                      <td style={{ padding: "12px 14px", color: "#64748b", fontSize: 12 }}>{item.category ?? "—"}</td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: isLow ? "#ef4444" : isExpired ? "#f59e0b" : "#22c55e" }}>
                        {item.quantity} {item.unit}
                      </td>
                      <td style={{ padding: "12px 14px", color: "#64748b" }}>{item.minQuantity ?? "—"}</td>
                      <td style={{ padding: "12px 14px", color: "#64748b" }}>{item.price ? `₺${item.price}` : "—"}</td>
                      <td style={{ padding: "12px 14px" }}>
                        {isExpired
                          ? <span className="badge" style={{ background: "#fee2e2", color: "#991b1b" }}>Süresi Dolmuş</span>
                          : isLow
                            ? <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>Düşük</span>
                            : <span className="badge" style={{ background: "#dcfce7", color: "#166534" }}>Yeterli</span>
                        }
                      </td>
                      <td style={{ padding: "12px 14px" }}>
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
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card" style={{ width: 300, flexShrink: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{selected.name}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, marginBottom: 16 }}>
              {[
                ["Kategori", selected.category ?? "—"],
                ["Stok", `${selected.quantity} ${selected.unit ?? ""}`],
                ["Min. Stok", selected.minQuantity ?? "—"],
                ["Birim Fiyat", selected.price ? `₺${selected.price}` : "—"],
                ["Son Kullanma", selected.expiryDate?.slice(0, 10) ?? "—"],
                ["Tedarikçi", selected.supplier ?? "—"],
              ].map(([k, v]) => (
                <div key={k as string} style={{ display: "flex", justifyContent: "space-between" }}>
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
                      <span className="badge" style={{ background: m.type === "In" ? "#dcfce7" : m.type === "Out" ? "#fee2e2" : "#fef3c7", color: m.type === "In" ? "#166534" : m.type === "Out" ? "#991b1b" : "#92400e", fontSize: 10 }}>
                        {m.type === "In" ? "Giriş" : m.type === "Out" ? "Çıkış" : "Düzeltme"}
                      </span>
                      <span style={{ flex: 1 }}>{m.quantity} {m.note && `· ${m.note}`}</span>
                      <span style={{ color: "#94a3b8" }}>{m.createdAt?.slice(0, 10)}</span>
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
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </AppShell>
  );
}

/* ── Quick Movement ─────────────────────────────────────────────── */
function QuickMovement({ stockId, onDone }: { stockId: string; onDone: () => void }) {
  const [type,     setType]     = useState<"In"|"Out"|"Adjustment">("In");
  const [qty,      setQty]      = useState(1);
  const [note,     setNote]     = useState("");
  const [saving,   setSaving]   = useState(false);

  const save = async () => {
    setSaving(true);
    await apiFetch(`/Stock/${stockId}/movement`, { method: "POST", body: JSON.stringify({ type, quantity: qty, note }) });
    setSaving(false);
    setQty(1); setNote("");
    onDone();
  };

  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--surface-2,#f8fafc)", border: "1px solid var(--border,#eaecf0)" }}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "#344054", textTransform: "uppercase", letterSpacing: "0.5px" }}>Hızlı Hareket</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <select value={type} onChange={e => setType(e.target.value as "In"|"Out"|"Adjustment")} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border,#d0d5dd)", fontSize: 12, background: "var(--surface,#fff)" }}>
          <option value="In">Giriş</option>
          <option value="Out">Çıkış</option>
          <option value="Adjustment">Düzeltme</option>
        </select>
        <input type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value))} style={{ width: 64, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border,#d0d5dd)", fontSize: 12, background: "var(--surface,#fff)" }} />
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Not..." style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border,#d0d5dd)", fontSize: 12, background: "var(--surface,#fff)" }} />
        <button onClick={save} disabled={saving} className="btn btn-primary" style={{ padding: "8px 14px", minHeight: 36, fontSize: 12 }}>
          {saving ? "..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
}

/* ── Stock Modal ────────────────────────────────────────────────── */
function StockModal({ item, categories, onClose, onSaved }: { item: StockItem | null; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item?.id;
  const [form, setForm] = useState({
    name:        item?.name ?? "",
    category:    item?.category ?? "",
    unit:        item?.unit ?? "adet",
    quantity:    item?.quantity ?? 0,
    minQuantity: item?.minQuantity ?? 0,
    price:       item?.price ?? 0,
    expiryDate:  item?.expiryDate?.slice(0, 10) ?? "",
    supplier:    item?.supplier ?? "",
    notes:       item?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: ["quantity","minQuantity","price"].includes(k) ? Number(e.target.value) : e.target.value }));

  const save = async () => {
    if (!form.name) { setError("Ürün adı zorunludur."); return; }
    setSaving(true);
    try {
      const res = isEdit
        ? await apiFetch(`/Stock/${item!.id}`, { method: "PUT", body: JSON.stringify(form) })
        : await apiFetch("/Stock", { method: "POST", body: JSON.stringify(form) });
      if (res.ok) onSaved();
      else { const d = await res.json().catch(() => ({})); setError(d.message ?? "Kayıt hatası"); }
    } finally { setSaving(false); }
  };

  const s: React.CSSProperties = { width: "100%", padding: "11px 14px", borderRadius: 10, minHeight: 44, border: "1px solid var(--border,#d0d5dd)", fontSize: 14, background: "var(--surface,#fff)", color: "var(--text,#101828)", WebkitAppearance: "none" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, backdropFilter: "blur(3px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(500px, 94vw)", zIndex: 301, maxHeight: "92vh", overflowY: "auto", background: "var(--surface,#fff)", borderRadius: 20, boxShadow: "0 24px 64px rgba(15,23,42,0.22)", border: "1px solid var(--border,#eaecf0)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{isEdit ? "Ürün Düzenle" : "Yeni Ürün"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="form-grid">
            <div className="form-full"><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Ürün Adı *</label><input value={form.name} onChange={set("name")} style={s} /></div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Kategori</label>
              <input value={form.category} onChange={set("category")} list="cat-list" style={s} />
              <datalist id="cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Birim</label><input value={form.unit} onChange={set("unit")} style={s} placeholder="adet, litre, kg..." /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Stok Miktarı</label><input type="number" min={0} value={form.quantity} onChange={set("quantity")} style={s} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Minimum Stok</label><input type="number" min={0} value={form.minQuantity} onChange={set("minQuantity")} style={s} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Birim Fiyat (₺)</label><input type="number" min={0} step={0.01} value={form.price} onChange={set("price")} style={s} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Son Kullanma Tarihi</label><input type="date" value={form.expiryDate} onChange={set("expiryDate")} style={s} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Tedarikçi</label><input value={form.supplier} onChange={set("supplier")} style={s} /></div>
          </div>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Notlar</label><textarea value={form.notes} onChange={set("notes")} rows={2} style={{ ...s, resize: "vertical" }} /></div>
          {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", color: "#b42318", fontSize: 13, fontWeight: 600 }}>⚠ {error}</div>}
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
