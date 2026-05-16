"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

/* ── Types ─────────────────────────────────────────────────────── */
type Category = { id: string; name: string; description?: string; serviceCount?: number };
type Service = {
  id: string;
  name: string;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
  isDemo: boolean;
  usageThisMonth: number;
  usageTotal: number;
};

type BulkPriceMode = "percent" | "fixed";

/* ── Helpers ────────────────────────────────────────────────────── */
function popularityBadge(total: number, month: number): { label: string; bg: string; color: string } | null {
  if (total === 0)  return { label: "Hiç kullanılmadı", bg: "#f1f5f9", color: "#94a3b8" };
  if (month >= 10)  return { label: "Çok Popüler",      bg: "#fef9c3", color: "#854d0e" };
  if (month >= 4)   return { label: "Popüler",           bg: "#dcfce7", color: "#166534" };
  return null;
}

function fmt(n: number) { return n.toLocaleString("tr-TR"); }

/* ── Page ───────────────────────────────────────────────────────── */
export default function ServicesPage() {
  const { toast, confirm } = useToast();
  const [services,    setServices]    = useState<Service[]>([]);
  const [categories,  setCategories]  = useState<Category[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [filterCat,   setFilterCat]   = useState("");
  const [filterActive, setFilterActive] = useState<"all"|"active"|"passive">("active");
  const [tab,         setTab]         = useState<"services"|"categories">("services");

  // modals
  const [showService,  setShowService]  = useState(false);
  const [editService,  setEditService]  = useState<Service | null>(null);
  const [showCat,      setShowCat]      = useState(false);
  const [editCat,      setEditCat]      = useState<Category | null>(null);
  const [showBulk,     setShowBulk]     = useState(false);

  // demo
  const [demoLoading,  setDemoLoading]  = useState(false);
  const hasDemo = services.some(s => s.isDemo);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([
        apiFetch(`/Services/stats`),
        apiFetch("/Services/categories"),
      ]);
      if (sRes.ok) setServices(await sRes.json());
      if (cRes.ok) setCategories(await cRes.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const delService = async (id: string) => {
    const ok = await confirm({ message: "Bu hizmeti silmek istediğinizden emin misiniz?", danger: true });
    if (!ok) return;
    const res = await apiFetch(`/Services/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.message ?? "Silme işlemi başarısız.");
      return;
    }
    toast.success("Hizmet silindi.");
    load();
  };

  const delCategory = async (id: string) => {
    const ok = await confirm({ message: "Bu kategoriyi silmek istediğinizden emin misiniz?", danger: true });
    if (!ok) return;
    await apiFetch(`/Services/categories/${id}`, { method: "DELETE" });
    load();
  };

  const toggleActive = async (service: Service) => {
    await apiFetch(`/Services/${service.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !service.isActive }),
    });
    load();
  };

  const seedDemo = async () => {
    const ok = await confirm({ message: "20 gerçekçi hizmet + 5 kategori eklenecek. Devam edilsin mi?" });
    if (!ok) return;
    setDemoLoading(true);
    try {
      const res = await apiFetch("/Services/seed-demo", { method: "POST" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.message ?? "Hata"); return; }
      await load();
    } finally { setDemoLoading(false); }
  };

  const clearDemo = async () => {
    const ok2 = await confirm({ message: "Tüm DEMO işaretli hizmetler ve boşalan kategoriler silinecek. Emin misiniz?", danger: true });
    if (!ok2) return;
    setDemoLoading(true);
    try {
      const res = await apiFetch("/Services/seed-demo", { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.message ?? "Hata"); return; }
      await load();
    } finally { setDemoLoading(false); }
  };

  // Derived stats
  const activeCount  = services.filter(s => s.isActive).length;
  const passiveCount = services.filter(s => !s.isActive).length;
  const avgPrice     = services.length ? Math.round(services.reduce((a, s) => a + s.price, 0) / services.length) : 0;
  const totalMonthUse = services.reduce((a, s) => a + s.usageThisMonth, 0);
  const topService   = services.length
    ? services.reduce((a, b) => b.usageTotal > a.usageTotal ? b : a)
    : null;

  // Filter
  const filtered = services.filter(s => {
    if (filterCat && s.categoryId !== filterCat) return false;
    if (filterActive === "active"  && !s.isActive) return false;
    if (filterActive === "passive" && s.isActive)  return false;
    return true;
  });

  // Group services by category
  const grouped: Record<string, Service[]> = {};
  filtered.forEach(s => {
    const key = s.categoryName ?? "Kategorisiz";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  return (
    <AppShell
      title="Hizmetler"
      description="Salon hizmet kataloğunu yönetin"
      actions={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Demo buttons */}
          {!hasDemo ? (
            <button onClick={seedDemo} disabled={demoLoading}
              style={{ padding: "8px 14px", borderRadius: 10, border: "1.5px dashed #a78bfa", background: "#faf5ff", color: "#7c3aed", cursor: "pointer", fontSize: 12, fontWeight: 700, minHeight: 40, opacity: demoLoading ? 0.6 : 1 }}>
              {demoLoading ? "Yükleniyor..." : "Demo Veri Yükle"}
            </button>
          ) : (
            <button onClick={clearDemo} disabled={demoLoading}
              style={{ padding: "8px 14px", borderRadius: 10, border: "1.5px dashed #fca5a5", background: "#fff5f5", color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700, minHeight: 40, opacity: demoLoading ? 0.6 : 1 }}>
              {demoLoading ? "Temizleniyor..." : "Demo Verileri Sil"}
            </button>
          )}
          <button onClick={() => setShowBulk(true)} className="btn btn-ghost" style={{ fontSize: 13 }}>Toplu Fiyat</button>
          <button onClick={() => { setEditCat(null); setShowCat(true); }} className="btn btn-ghost" style={{ fontSize: 13 }}>+ Kategori</button>
          <button onClick={() => { setEditService(null); setShowService(true); }} className="btn btn-primary">+ Hizmet</button>
        </div>
      }
    >
      {/* ── Özet Paneli ── */}
      {services.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}>
          {[
            { label: "Aktif Hizmet",      value: activeCount,    sub: `${passiveCount} pasif`,        accent: "#7c3aed" },
            { label: "Ortalama Fiyat",    value: `₺${fmt(avgPrice)}`, sub: `${services.length} hizmet toplamda`, accent: "#0ea5e9" },
            { label: "Bu Ay Randevu",     value: totalMonthUse,  sub: "hizmet seçilerek oluşturulan", accent: "#22c55e" },
            { label: "En Popüler",        value: topService?.name ?? "—", sub: `${topService?.usageTotal ?? 0} kez kullanıldı`, accent: "#f59e0b" },
          ].map(card => (
            <div key={card.label} className="card" style={{ padding: "14px 16px", borderLeft: `3px solid ${card.accent}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: card.accent }}>{card.value}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(["services","categories"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`btn ${tab === t ? "btn-primary" : "btn-ghost"}`} style={{ padding: "8px 16px", minHeight: 40, fontSize: 13 }}>
            {t === "services" ? "Hizmetler" : "Kategoriler"}
          </button>
        ))}
      </div>

      {tab === "services" && (
        <>
          {/* Filter bar */}
          <div className="toolbar" style={{ flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="inp" style={{ width: 180, minHeight: 40 }}>
              <option value="">Tüm Kategoriler</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: 4 }}>
              {(["all","active","passive"] as const).map(f => (
                <button key={f} onClick={() => setFilterActive(f)}
                  style={{
                    padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: `1.5px solid ${filterActive === f ? "#7c3aed" : "#e2e8f0"}`,
                    background: filterActive === f ? "#ede9fe" : "transparent",
                    color: filterActive === f ? "#7c3aed" : "#64748b",
                  }}>
                  {f === "all" ? "Tümü" : f === "active" ? "Aktif" : "Pasif"}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 13, color: "#64748b", marginLeft: "auto" }}>
              {filtered.length} hizmet
            </span>
          </div>

          {loading ? (
            <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>
              <div style={{ width: 32, height: 32, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
              Yükleniyor...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✂️</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Henüz hizmet yok</div>
              <div style={{ color: "#64748b", marginBottom: 20 }}>Demo veri yükleyerek başlayabilirsiniz.</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={seedDemo} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px dashed #a78bfa", background: "#faf5ff", color: "#7c3aed", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                  Demo Veri Yükle
                </button>
                <button onClick={() => { setEditService(null); setShowService(true); }} className="btn btn-primary">+ Hizmet Ekle</button>
              </div>
            </div>
          ) : filterCat ? (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <ServiceTable services={filtered} onEdit={s => { setEditService(s); setShowService(true); }} onDelete={delService} onToggle={toggleActive} />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {Object.entries(grouped).map(([cat, svcs]) => {
                const catMonthUse = svcs.reduce((a, s) => a + s.usageThisMonth, 0);
                return (
                  <div key={cat} className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <div style={{
                      padding: "12px 16px",
                      background: "var(--primary-light,#ede9fe)",
                      borderBottom: "1px solid var(--border,#eaecf0)",
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: "#7c3aed" }}>{cat}</span>
                      <span className="badge" style={{ background: "#7c3aed", color: "#fff" }}>{svcs.length}</span>
                      {catMonthUse > 0 && (
                        <span style={{ fontSize: 11, color: "#7c3aed", background: "#f3e8ff", borderRadius: 6, padding: "2px 8px", fontWeight: 700, marginLeft: 4 }}>
                          Bu ay {catMonthUse} randevu
                        </span>
                      )}
                    </div>
                    <ServiceTable services={svcs} onEdit={s => { setEditService(s); setShowService(true); }} onDelete={delService} onToggle={toggleActive} />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "categories" && (
        <div>
          {categories.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Henüz kategori yok</div>
              <button onClick={() => { setEditCat(null); setShowCat(true); }} className="btn btn-primary">+ Kategori Ekle</button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {categories.map(c => {
                const catServices = services.filter(s => s.categoryId === c.id);
                const catActive   = catServices.filter(s => s.isActive).length;
                const catMonth    = catServices.reduce((a, s) => a + s.usageThisMonth, 0);
                const catRevPot   = catServices.filter(s => s.isActive).reduce((a, s) => a + s.price, 0);
                return (
                  <div key={c.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 3 }}>{c.name}</div>
                      {c.description && <div style={{ fontSize: 12, color: "#64748b" }}>{c.description}</div>}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>AKTİF HİZMET</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#7c3aed" }}>{catActive}</div>
                      </div>
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>BU AY RANDEVU</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#0ea5e9" }}>{catMonth}</div>
                      </div>
                    </div>
                    {catRevPot > 0 && (
                      <div style={{ fontSize: 12, color: "#64748b", background: "#fafaf9", borderRadius: 8, padding: "6px 10px" }}>
                        Aktif hizmet fiyat toplamı: <strong>₺{fmt(catRevPot)}</strong>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setEditCat(c); setShowCat(true); }} className="btn btn-ghost" style={{ flex: 1, fontSize: 12, minHeight: 36 }}>Düzenle</button>
                      <button onClick={() => delCategory(c.id)} style={{ flex: 1, borderRadius: 10, border: "1px solid #fee2e2", background: "#fef2f2", color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 600, minHeight: 36 }}>Sil</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showService && (
        <ServiceModal
          service={editService}
          categories={categories}
          onClose={() => setShowService(false)}
          onSaved={() => { setShowService(false); load(); }}
        />
      )}
      {showCat && (
        <CategoryModal
          category={editCat}
          onClose={() => setShowCat(false)}
          onSaved={() => { setShowCat(false); load(); }}
        />
      )}
      {showBulk && (
        <BulkPriceModal
          categories={categories}
          onClose={() => setShowBulk(false)}
          onSaved={() => { setShowBulk(false); load(); }}
        />
      )}
    </AppShell>
  );
}

/* ── Service Table ──────────────────────────────────────────────── */
function ServiceTable({ services, onEdit, onDelete, onToggle }: {
  services: Service[];
  onEdit: (s: Service) => void;
  onDelete: (id: string) => void;
  onToggle: (s: Service) => void;
}) {
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 560 }}>
      <thead>
        <tr style={{ background: "var(--surface-2,#f8fafc)" }}>
          {["Hizmet","Süre","Fiyat","Kullanım","Durum",""].map(h => (
            <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "#64748b", borderBottom: "1px solid var(--border,#eaecf0)" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {services.map(s => {
          const badge = popularityBadge(s.usageTotal, s.usageThisMonth);
          return (
            <tr key={s.id} style={{ borderBottom: "1px solid var(--border,#f2f4f7)" }}>
              <td style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 700 }}>{s.name}</span>
                  {s.isDemo && (
                    <span style={{ fontSize: 10, fontWeight: 800, background: "#ede9fe", color: "#7c3aed", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.04em" }}>DEMO</span>
                  )}
                </div>
                {s.description && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{s.description}</div>}
                {badge && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, borderRadius: 4, padding: "1px 6px", marginTop: 4, display: "inline-block" }}>
                    {badge.label}
                  </span>
                )}
              </td>
              <td style={{ padding: "12px 16px", color: "#64748b", whiteSpace: "nowrap" }}>{s.durationMinutes} dk</td>
              <td style={{ padding: "12px 16px", fontWeight: 700, color: "#22c55e", whiteSpace: "nowrap" }}>
                ₺{fmt(s.price)}
              </td>
              <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.usageThisMonth > 0 ? "#7c3aed" : "#cbd5e1" }}>
                  {s.usageThisMonth > 0 ? `${s.usageThisMonth} bu ay` : "—"}
                </div>
                {s.usageTotal > 0 && (
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>toplam {s.usageTotal}</div>
                )}
              </td>
              <td style={{ padding: "12px 16px" }}>
                <button onClick={() => onToggle(s)} style={{
                  padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                  border: "none", cursor: "pointer",
                  background: s.isActive ? "#dcfce7" : "#fee2e2",
                  color: s.isActive ? "#166534" : "#991b1b",
                }}>
                  {s.isActive ? "Aktif" : "Pasif"}
                </button>
              </td>
              <td style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => onEdit(s)} className="btn btn-ghost" style={{ padding: "6px 12px", minHeight: 34, fontSize: 12 }}>Düzenle</button>
                  <button onClick={() => onDelete(s.id)} style={{ padding: "6px 10px", minHeight: 34, borderRadius: 8, border: "1px solid #fee2e2", background: "#fef2f2", color: "#ef4444", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Sil</button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

/* ── Bulk Price Modal ───────────────────────────────────────────── */
function BulkPriceModal({ categories, onClose, onSaved }: {
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [catId,   setCatId]   = useState("");
  const [mode,    setMode]    = useState<BulkPriceMode>("percent");
  const [amount,  setAmount]  = useState<number>(10);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const save = async () => {
    if (!amount || amount === 0) { setError("Miktar 0 olamaz."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/Services/bulk-price", {
        method: "POST",
        body: JSON.stringify({
          categoryId: catId || null,
          mode,
          amount,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        toast.success(`${d.updated} hizmetin fiyatı güncellendi.`);
        onSaved();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.message ?? "Güncelleme hatası.");
      }
    } finally { setSaving(false); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "11px 14px", borderRadius: 10, minHeight: 44, border: "1px solid var(--border,#d0d5dd)", fontSize: 14, background: "var(--surface,#fff)", color: "var(--text,#101828)", WebkitAppearance: "none" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, backdropFilter: "blur(3px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(440px, 94vw)", zIndex: 301, background: "var(--surface,#fff)", borderRadius: 20, boxShadow: "0 24px 64px rgba(15,23,42,0.22)", border: "1px solid var(--border,#eaecf0)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Toplu Fiyat Güncelleme</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Kategori (boş bırakırsan tümü güncellenir)</label>
            <select value={catId} onChange={e => setCatId(e.target.value)} style={inp}>
              <option value="">Tüm Kategoriler</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Güncelleme Türü</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["percent","fixed"] as BulkPriceMode[]).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    border: `2px solid ${mode === m ? "#7c3aed" : "#e2e8f0"}`,
                    background: mode === m ? "#ede9fe" : "transparent",
                    color: mode === m ? "#7c3aed" : "#64748b",
                  }}>
                  {m === "percent" ? "Yüzde (%)" : "Sabit Tutar (₺)"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>
              Miktar ({mode === "percent" ? "%" : "₺"}) — negatif değer fiyatı düşürür
            </label>
            <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} style={inp} step={mode === "percent" ? 1 : 10} />
          </div>
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#64748b" }}>
            {mode === "percent"
              ? `₺100 → ₺${(100 * (1 + amount / 100)).toFixed(0)} | ₺500 → ₺${(500 * (1 + amount / 100)).toFixed(0)}`
              : `₺100 → ₺${(100 + amount).toFixed(0)} | ₺500 → ₺${(500 + amount).toFixed(0)}`}
          </div>
          {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", color: "#b42318", fontSize: 13, fontWeight: 600 }}>⚠ {error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>İptal</button>
            <button onClick={save} disabled={saving} className="btn btn-primary" style={{ flex: 2, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Güncelleniyor..." : "Fiyatları Güncelle"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Service Modal ──────────────────────────────────────────────── */
function ServiceModal({ service, categories, onClose, onSaved }: {
  service: Service | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!service?.id;
  const [form, setForm] = useState({
    name:            service?.name ?? "",
    description:     service?.description ?? "",
    categoryId:      service?.categoryId ?? "",
    durationMinutes: service?.durationMinutes ?? 30,
    price:           service?.price ?? 0,
    isActive:        service?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.type === "checkbox" ? (e.target as HTMLInputElement).checked : k === "durationMinutes" || k === "price" ? Number(e.target.value) : e.target.value }));

  const save = async () => {
    if (!form.name) { setError("Hizmet adı zorunludur."); return; }
    if (form.durationMinutes < 1) { setError("Süre 1 dakikadan az olamaz."); return; }
    if (form.price < 0) { setError("Fiyat negatif olamaz."); return; }
    setSaving(true);
    try {
      const payload = { ...form, categoryId: form.categoryId || null };
      const res = isEdit
        ? await apiFetch(`/Services/${service!.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch("/Services", { method: "POST", body: JSON.stringify(payload) });
      if (res.ok) onSaved();
      else { const d = await res.json().catch(() => ({})); setError(d.message ?? "Kayıt hatası"); }
    } finally { setSaving(false); }
  };

  const s: React.CSSProperties = { width: "100%", padding: "11px 14px", borderRadius: 10, minHeight: 44, border: "1px solid var(--border,#d0d5dd)", fontSize: 14, background: "var(--surface,#fff)", color: "var(--text,#101828)", WebkitAppearance: "none" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, backdropFilter: "blur(3px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(480px, 94vw)", zIndex: 301, maxHeight: "92vh", overflowY: "auto", background: "var(--surface,#fff)", borderRadius: 20, boxShadow: "0 24px 64px rgba(15,23,42,0.22)", border: "1px solid var(--border,#eaecf0)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{isEdit ? "Hizmet Düzenle" : "Yeni Hizmet"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Hizmet Adı *</label>
            <input value={form.name} onChange={set("name")} style={s} placeholder="Saç kesimi, boya, bakım..." />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Açıklama</label>
            <textarea value={form.description} onChange={set("description")} rows={2} style={{ ...s, resize: "vertical" }} placeholder="Hizmet hakkında kısa açıklama..." />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Kategori</label>
            <select value={form.categoryId} onChange={set("categoryId")} style={s}>
              <option value="">Kategori seçiniz...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-grid">
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Süre (dakika) *</label>
              <input type="number" min={1} max={480} value={form.durationMinutes} onChange={set("durationMinutes")} style={s} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Fiyat (₺) *</label>
              <input type="number" min={0} step={1} value={form.price} onChange={set("price")} style={s} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>Hızlı süre:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[15, 20, 30, 45, 60, 90, 120].map(m => (
                <button key={m} onClick={() => setForm(p => ({ ...p, durationMinutes: m }))}
                  style={{
                    padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: `1.5px solid ${form.durationMinutes === m ? "#7c3aed" : "#e2e8f0"}`,
                    background: form.durationMinutes === m ? "#ede9fe" : "transparent",
                    color: form.durationMinutes === m ? "#7c3aed" : "#64748b",
                    cursor: "pointer",
                  }}>
                  {m} dk
                </button>
              ))}
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={form.isActive} onChange={set("isActive")} style={{ width: 18, height: 18, accentColor: "#7c3aed" }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Aktif (randevularda göster)</span>
          </label>
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

/* ── Category Modal ─────────────────────────────────────────────── */
function CategoryModal({ category, onClose, onSaved }: { category: Category | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!category?.id;
  const [name, setName]     = useState(category?.name ?? "");
  const [desc, setDesc]     = useState(category?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const save = async () => {
    if (!name.trim()) { setError("Kategori adı zorunludur."); return; }
    setSaving(true);
    try {
      const res = isEdit
        ? await apiFetch(`/Services/categories/${category!.id}`, { method: "PUT", body: JSON.stringify({ name, description: desc }) })
        : await apiFetch("/Services/categories", { method: "POST", body: JSON.stringify({ name, description: desc }) });
      if (res.ok) onSaved();
      else { const d = await res.json().catch(() => ({})); setError(d.message ?? "Kayıt hatası"); }
    } finally { setSaving(false); }
  };

  const s: React.CSSProperties = { width: "100%", padding: "11px 14px", borderRadius: 10, minHeight: 44, border: "1px solid var(--border,#d0d5dd)", fontSize: 14, background: "var(--surface,#fff)", color: "var(--text,#101828)", WebkitAppearance: "none" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 400, backdropFilter: "blur(3px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(400px, 92vw)", zIndex: 401, background: "var(--surface,#fff)", borderRadius: 20, boxShadow: "0 24px 64px rgba(15,23,42,0.22)", border: "1px solid var(--border,#eaecf0)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{isEdit ? "Kategori Düzenle" : "Yeni Kategori"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Kategori Adı *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={s} placeholder="Saç, Cilt, Tırnak..." />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Açıklama</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} style={{ ...s, resize: "vertical" }} />
          </div>
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
