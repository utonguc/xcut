"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────── */
type Category = { id: string; name: string; description?: string };
type Service = {
  id: string;
  name: string;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  durationMinutes: number;
  price: number;
  currency?: string;
  isActive: boolean;
};

/* ── Page ───────────────────────────────────────────────────────── */
export default function ServicesPage() {
  const [services,    setServices]    = useState<Service[]>([]);
  const [categories,  setCategories]  = useState<Category[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [filterCat,   setFilterCat]   = useState("");
  const [showService, setShowService] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [showCat,     setShowCat]     = useState(false);
  const [editCat,     setEditCat]     = useState<Category | null>(null);
  const [tab,         setTab]         = useState<"services"|"categories">("services");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([
        apiFetch(`/Services?categoryId=${filterCat}&pageSize=200`),
        apiFetch("/Services/categories"),
      ]);
      if (sRes.ok) setServices(await sRes.json());
      if (cRes.ok) setCategories(await cRes.json());
    } finally { setLoading(false); }
  }, [filterCat]);

  useEffect(() => { load(); }, [load]);

  const delService = async (id: string) => {
    if (!confirm("Bu hizmeti silmek istediğinizden emin misiniz?")) return;
    await apiFetch(`/Services/${id}`, { method: "DELETE" });
    load();
  };

  const delCategory = async (id: string) => {
    if (!confirm("Bu kategoriyi silmek istediğinizden emin misiniz?")) return;
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

  // Group services by category
  const grouped: Record<string, Service[]> = {};
  services.forEach(s => {
    const key = s.categoryName ?? "Kategorisiz";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  return (
    <AppShell
      title="Hizmetler"
      description="Salon hizmet kataloğunu yönetin"
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setEditCat(null); setShowCat(true); }} className="btn btn-ghost" style={{ fontSize: 13 }}>+ Kategori</button>
          <button onClick={() => { setEditService(null); setShowService(true); }} className="btn btn-primary">+ Hizmet</button>
        </div>
      }
    >
      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(["services","categories"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`btn ${tab === t ? "btn-primary" : "btn-ghost"}`} style={{ padding: "8px 16px", minHeight: 40, fontSize: 13 }}>
            {t === "services" ? "✂️ Hizmetler" : "📁 Kategoriler"}
          </button>
        ))}
      </div>

      {tab === "services" && (
        <>
          {/* Filter */}
          <div className="toolbar">
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="inp" style={{ width: 200, minHeight: 40 }}>
              <option value="">Tüm Kategoriler</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <span style={{ fontSize: 13, color: "#64748b", marginLeft: "auto" }}>
              {services.filter(s => s.isActive).length} aktif hizmet
            </span>
          </div>

          {loading ? (
            <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>
              <div style={{ width: 32, height: 32, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
              Yükleniyor...
            </div>
          ) : services.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✂️</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Henüz hizmet yok</div>
              <div style={{ color: "#64748b", marginBottom: 20 }}>İlk hizmetinizi ekleyin.</div>
              <button onClick={() => { setEditService(null); setShowService(true); }} className="btn btn-primary">+ Hizmet Ekle</button>
            </div>
          ) : filterCat ? (
            /* Flat list when filtered */
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <ServiceTable services={services} onEdit={s => { setEditService(s); setShowService(true); }} onDelete={delService} onToggle={toggleActive} />
            </div>
          ) : (
            /* Grouped by category */
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {Object.entries(grouped).map(([cat, svcs]) => (
                <div key={cat} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{
                    padding: "12px 16px",
                    background: "var(--primary-light,#ede9fe)",
                    borderBottom: "1px solid var(--border,#eaecf0)",
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 16 }}>📁</span>
                    <span style={{ fontWeight: 800, fontSize: 14, color: "#7c3aed" }}>{cat}</span>
                    <span className="badge" style={{ background: "#7c3aed", color: "#fff", marginLeft: "auto" }}>{svcs.length}</span>
                  </div>
                  <ServiceTable services={svcs} onEdit={s => { setEditService(s); setShowService(true); }} onDelete={delService} onToggle={toggleActive} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "categories" && (
        <div>
          {categories.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Henüz kategori yok</div>
              <button onClick={() => { setEditCat(null); setShowCat(true); }} className="btn btn-primary">+ Kategori Ekle</button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {categories.map(c => (
                <div key={c.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: "var(--primary-light,#ede9fe)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, flexShrink: 0,
                    }}>📁</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                      {c.description && <div style={{ fontSize: 12, color: "#64748b" }}>{c.description}</div>}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    {services.filter(s => s.categoryId === c.id).length} hizmet
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setEditCat(c); setShowCat(true); }} className="btn btn-ghost" style={{ flex: 1, fontSize: 12, minHeight: 36 }}>Düzenle</button>
                    <button onClick={() => delCategory(c.id)} style={{ flex: 1, borderRadius: 10, border: "1px solid #fee2e2", background: "#fef2f2", color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 600, minHeight: 36 }}>Sil</button>
                  </div>
                </div>
              ))}
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
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr style={{ background: "var(--surface-2,#f8fafc)" }}>
          {["Hizmet","Süre","Fiyat","Durum",""].map(h => (
            <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "#64748b", borderBottom: "1px solid var(--border,#eaecf0)" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {services.map(s => (
          <tr key={s.id} style={{ borderBottom: "1px solid var(--border,#f2f4f7)" }}>
            <td style={{ padding: "12px 16px" }}>
              <div style={{ fontWeight: 700 }}>{s.name}</div>
              {s.description && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{s.description}</div>}
            </td>
            <td style={{ padding: "12px 16px", color: "#64748b", whiteSpace: "nowrap" }}>⏱ {s.durationMinutes} dk</td>
            <td style={{ padding: "12px 16px", fontWeight: 700, color: "#22c55e", whiteSpace: "nowrap" }}>
              ₺{s.price.toLocaleString("tr-TR")}
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
        ))}
      </tbody>
    </table>
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
    currency:        service?.currency ?? "TRY",
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
      const res = isEdit
        ? await apiFetch(`/Services/${service!.id}`, { method: "PUT", body: JSON.stringify(form) })
        : await apiFetch("/Services", { method: "POST", body: JSON.stringify(form) });
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
              <input type="number" min={0} step={0.01} value={form.price} onChange={set("price")} style={s} />
            </div>
          </div>

          {/* Duration quick picks */}
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>Hızlı süre seçimi:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[15, 30, 45, 60, 90, 120].map(m => (
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
