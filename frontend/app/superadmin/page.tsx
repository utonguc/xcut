"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import RoleGuard from "@/components/RoleGuard";
import { apiFetch } from "@/lib/api";
import { btn, inp } from "@/lib/ui";
import { fmtDate } from "@/lib/tz";
import { APP_VERSION } from "@/lib/version";

type Salon = {
  id: string; name: string; city?: string; country?: string;
  emailDomain?: string; plan?: string;
  isActive: boolean; userCount: number; customerCount: number;
  activeModules: string[]; createdAtUtc: string;
};
type Module = {
  moduleCode: string; moduleLabel: string;
  isActive: boolean; expiresAtUtc?: string;
};
type SalonUser = {
  id: string; fullName: string; userName: string; email: string;
  isActive: boolean; roleName: string; createdAtUtc: string;
};

const ALL_MODULES = [
  { code: "crm",           label: "CRM & Müşteri Yönetimi" },
  { code: "appointments",  label: "Randevu Yönetimi" },
  { code: "stylists",      label: "Stilist Yönetimi" },
  { code: "services",      label: "Hizmet Kataloğu" },
  { code: "reports",       label: "Raporlama" },
  { code: "finance",       label: "Finans & Faturalama" },
  { code: "inventory",     label: "Stok Yönetimi" },
  { code: "assets",        label: "Demirbaş Takibi" },
  { code: "tasks",         label: "Görev Yönetimi" },
  { code: "notifications", label: "Bildirim & SMS/Email" },
  { code: "surveys",       label: "Anket & Memnuniyet" },
  { code: "whatsapp",      label: "WhatsApp Entegrasyonu" },
  { code: "website",       label: "Web Sitesi" },
];

const card: React.CSSProperties = {
  background: "var(--surface, #fff)", border: "1px solid #eaecf0",
  borderRadius: 16, boxShadow: "0 1px 4px rgba(16,24,40,0.06)",
};

function expiryStatus(expiresAtUtc?: string) {
  if (!expiresAtUtc) return { label: "Süresiz", color: "#059669", bg: "#f0fdf4" };
  const diff = Math.ceil((new Date(expiresAtUtc).getTime() - Date.now()) / 86400000);
  if (diff < 0)  return { label: "Süresi dolmuş", color: "#b42318", bg: "#fef3f2" };
  if (diff <= 7) return { label: `${diff} gün kaldı`, color: "#d97706", bg: "#fffbeb" };
  return { label: `${diff} gün kaldı`, color: "#059669", bg: "#f0fdf4" };
}

const emptyForm = () => ({
  name: "", city: "", country: "Türkiye", emailDomain: "",
  adminFullName: "", adminUserName: "", adminEmail: "", adminPassword: "",
  initialModules: ["crm","appointments","stylists","services","reports"] as string[],
});

export default function SuperAdminPage() {
  return (
    <RoleGuard roles={["SuperAdmin"]}>
      <SuperAdminPageInner />
    </RoleGuard>
  );
}

function SuperAdminPageInner() {
  const [topTab, setTopTab] = useState<"salons"|"announcements"|"support">("salons");

  const [salons,     setSalons]     = useState<Salon[]>([]);
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState<"all"|"active"|"passive">("all");
  const [selected,   setSelected]   = useState<Salon | null>(null);
  const [detailTab,  setDetailTab]  = useState<"general"|"modules"|"users">("general");
  const [showCreate, setShowCreate] = useState(false);
  const [message,    setMessage]    = useState("");
  const [loading,    setLoading]    = useState(false);
  const [form,       setForm]       = useState(emptyForm());

  const load = useCallback(async () => {
    const res = await apiFetch("/superadmin/salons");
    if (!res.ok) { setMessage("Erişim reddedildi."); return; }
    const data = await res.json();
    setSalons(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = salons.filter(s => {
    if (filter === "active"  && !s.isActive) return false;
    if (filter === "passive" &&  s.isActive) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const createSalon = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch("/superadmin/salons", { method: "POST", body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? "Hata"); }
      setShowCreate(false); setForm(emptyForm());
      setMessage("Salon oluşturuldu."); await load();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Hata"); }
    finally { setLoading(false); }
  };

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const toggleInitMod = (code: string) => setForm(p => ({
    ...p,
    initialModules: p.initialModules.includes(code)
      ? p.initialModules.filter(m => m !== code)
      : [...p.initialModules, code],
  }));

  return (
    <AppShell title="SuperAdmin Paneli" description="Salon, lisans ve kullanıcı yönetimi">

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 4, background: "var(--surface-2, #f8fafc)", borderRadius: 12, padding: 4, border: "1px solid #eaecf0" }}>
          {([
            { key: "salons",        label: "💈 Salonlar" },
            { key: "announcements", label: "📢 Duyurular" },
            { key: "support",       label: "🎫 Destek Talepleri" },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTopTab(t.key)} style={{
              padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: topTab === t.key ? 700 : 500,
              background: topTab === t.key ? "#7c3aed" : "transparent",
              color: topTab === t.key ? "#fff" : "#64748b",
              transition: "all 0.15s",
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "4px 12px", fontWeight: 700 }}>
          v{APP_VERSION}
        </div>
      </div>

      {message && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#f0fdf4", color: "#059669", border: "1px solid #bbf7d0", marginBottom: 16, fontSize: 13, fontWeight: 600 }}
          onClick={() => setMessage("")}>
          ✓ {message}
        </div>
      )}

      {topTab === "announcements" && <AnnouncementsTab />}
      {topTab === "support"       && <SupportTab />}

      {topTab === "salons" && <div style={{ display: "grid", gridTemplateColumns: selected ? "340px 1fr" : "1fr", gap: 16, alignItems: "start" }}>

        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <button onClick={() => setShowCreate(v => !v)} style={{
              padding: "8px 14px", borderRadius: 10, border: "none",
              background: "#7c3aed", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13,
            }}>
              {showCreate ? "✕ Kapat" : "+ Yeni Salon"}
            </button>
            <div style={{ fontSize: 13, color: "#667085", padding: "8px 12px", background: "var(--surface-2, #f8fafc)", borderRadius: 10, border: "1px solid #eaecf0" }}>
              {salons.length} salon · {salons.filter(s => s.isActive).length} aktif
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Salon ara..." style={{ ...inp, flex: 1 }} />
            <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}
              style={{ ...inp, width: "auto", flex: "0 0 auto" }}>
              <option value="all">Tümü</option>
              <option value="active">Aktif</option>
              <option value="passive">Pasif</option>
            </select>
          </div>

          {showCreate && (
            <div style={{ ...card, padding: 18, marginBottom: 14, border: "1px solid #e9d5ff", background: "#faf5ff" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#6d28d9", marginBottom: 14 }}>Yeni Salon</div>
              <form onSubmit={createSalon} style={{ display: "grid", gap: 10 }}>
                <input placeholder="Salon adı *" value={form.name} onChange={e => f("name", e.target.value)} style={inp} required />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input placeholder="Şehir" value={form.city} onChange={e => f("city", e.target.value)} style={inp} />
                  <input placeholder="Ülke" value={form.country} onChange={e => f("country", e.target.value)} style={inp} />
                </div>
                <div>
                  <input
                    placeholder="E-posta domain (ör: salon-a.com.tr)"
                    value={form.emailDomain}
                    onChange={e => f("emailDomain", e.target.value.trim().toLowerCase())}
                    style={inp}
                  />
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    Personel bu domain'deki e-postalarıyla giriş yapar.
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6d28d9", marginTop: 4 }}>Yönetici Hesabı</div>
                <input placeholder="Ad Soyad *" value={form.adminFullName} onChange={e => f("adminFullName", e.target.value)} style={inp} required />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input placeholder="Kullanıcı adı *" value={form.adminUserName} onChange={e => f("adminUserName", e.target.value)} style={inp} required />
                  <input placeholder="E-posta" value={form.adminEmail} onChange={e => f("adminEmail", e.target.value)} style={inp} />
                </div>
                <input type="password" placeholder="Şifre * (min 6)" value={form.adminPassword} onChange={e => f("adminPassword", e.target.value)} style={inp} required minLength={6} />

                <div style={{ fontSize: 12, fontWeight: 700, color: "#6d28d9" }}>Başlangıç Modülleri</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ALL_MODULES.map(m => {
                    const on = form.initialModules.includes(m.code);
                    return (
                      <button key={m.code} type="button" onClick={() => toggleInitMod(m.code)}
                        style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                          background: on ? "#7c3aed" : "#fff", color: on ? "#fff" : "#667085",
                          border: `1px solid ${on ? "#7c3aed" : "#d0d5dd"}` }}>
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button type="submit" disabled={loading} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                    {loading ? "Oluşturuluyor..." : "Oluştur"}
                  </button>
                  <button type="button" onClick={() => setShowCreate(false)} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #d0d5dd", background: "var(--surface, #fff)", color: "var(--text-2, #344054)", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                    İptal
                  </button>
                </div>
              </form>
            </div>
          )}

          <div style={{ display: "grid", gap: 8 }}>
            {filtered.map(s => (
              <div key={s.id} onClick={() => { setSelected(s); setDetailTab("general"); }}
                style={{ ...card, padding: 16, cursor: "pointer",
                  borderLeft: selected?.id === s.id ? "4px solid #7c3aed" : "4px solid transparent",
                  background: selected?.id === s.id ? "#faf5ff" : "#fff",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { if (selected?.id !== s.id) e.currentTarget.style.background = "#f8fafc"; }}
                onMouseLeave={e => { if (selected?.id !== s.id) e.currentTarget.style.background = "#fff"; }}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text, #101828)" }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "#667085", marginTop: 2 }}>
                      {[s.city, s.country].filter(Boolean).join(", ") || "—"}
                    </div>
                    {s.emailDomain && (
                      <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 2, fontWeight: 600 }}>
                        @{s.emailDomain}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                    background: s.isActive ? "#f0fdf4" : "#fef3f2",
                    color: s.isActive ? "#059669" : "#b42318",
                    border: `1px solid ${s.isActive ? "#bbf7d0" : "#fecaca"}` }}>
                    {s.isActive ? "Aktif" : "Pasif"}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 11, color: "#94a3b8" }}>
                  <span>👤 {s.userCount}</span>
                  <span>💇 {s.customerCount}</span>
                  <span>📦 {s.activeModules.length} modül</span>
                  <span>🗓 {fmtDate(s.createdAtUtc)}</span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ color: "#98a2b3", fontSize: 13, padding: 24, textAlign: "center" }}>Salon bulunamadı.</div>
            )}
          </div>
        </div>

        {selected && (
          <SalonDetail
            salon={selected}
            onClose={() => setSelected(null)}
            onUpdated={async () => { await load(); }}
            onMessage={setMessage}
            tab={detailTab}
            setTab={setDetailTab}
          />
        )}
      </div>}
    </AppShell>
  );
}

type Announcement = {
  id: string; title: string; body: string; type: string;
  isPublished: boolean; expiresAtUtc?: string;
  createdAtUtc: string; readCount: number;
};

function AnnouncementsTab() {
  const [items,    setItems]    = useState<Announcement[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ title: "", body: "", type: "info", isPublished: true, expiresAtUtc: "" });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch("/superadmin/announcements");
    if (r.ok) setItems(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.title.trim()) { setError("Başlık zorunlu."); return; }
    setSaving(true);
    const r = await apiFetch("/superadmin/announcements", {
      method: "POST",
      body: JSON.stringify({ ...form, expiresAtUtc: form.expiresAtUtc ? new Date(form.expiresAtUtc).toISOString() : null }),
    });
    setSaving(false);
    if (r.ok) { setShowForm(false); setForm({ title: "", body: "", type: "info", isPublished: true, expiresAtUtc: "" }); load(); }
    else { const d = await r.json().catch(() => ({})); setError(d.message ?? "Hata."); }
  };

  const toggle = async (id: string) => {
    await apiFetch(`/superadmin/announcements/${id}/publish`, { method: "PATCH" });
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Duyuru silinsin mi?")) return;
    await apiFetch(`/superadmin/announcements/${id}`, { method: "DELETE" });
    load();
  };

  const TYPE_OPTS = [
    { value: "info",    label: "Bilgi (mavi)" },
    { value: "success", label: "Başarı (yeşil)" },
    { value: "warning", label: "Uyarı (sarı)" },
    { value: "error",   label: "Kritik (kırmızı)" },
  ];

  const TYPE_COLOR: Record<string, { color: string; bg: string }> = {
    info:    { color: "#1d4ed8", bg: "#eff8ff" },
    success: { color: "#059669", bg: "#f0fdf4" },
    warning: { color: "#d97706", bg: "#fffbeb" },
    error:   { color: "#b42318", bg: "#fef3f2" },
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#64748b" }}>{items.length} duyuru</div>
        <button onClick={() => setShowForm(v => !v)} style={{
          padding: "9px 18px", borderRadius: 10, border: "none",
          background: "#7c3aed", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13,
        }}>
          {showForm ? "✕ Kapat" : "+ Yeni Duyuru"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#6d28d9", marginBottom: 14 }}>Yeni Duyuru</div>
          {error && <div style={{ background: "#fef3f2", color: "#b42318", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Başlık *" style={inp} />
            <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
              placeholder="Duyuru metni" rows={4}
              style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 13, resize: "vertical" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Tür</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inp}>
                  {TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Son Tarih</label>
                <input type="date" value={form.expiresAtUtc} onChange={e => setForm(p => ({ ...p, expiresAtUtc: e.target.value }))} style={inp} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={form.isPublished} onChange={e => setForm(p => ({ ...p, isPublished: e.target.checked }))} />
                  Hemen Yayınla
                </label>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={save} disabled={saving} style={{
                padding: "9px 18px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff",
                fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: 13,
              }}>{saving ? "Kaydediliyor..." : "Oluştur"}</button>
              <button onClick={() => setShowForm(false)} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #d0d5dd", background: "var(--surface, #fff)", color: "var(--text-2, #344054)", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>İptal</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Yükleniyor...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📢</div>
          Henüz duyuru yok
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map(a => {
            const s = TYPE_COLOR[a.type] ?? TYPE_COLOR.info;
            return (
              <div key={a.id} style={{ background: "var(--surface, #fff)", border: "1px solid #eaecf0", borderRadius: 14, padding: 16, borderLeft: `4px solid ${s.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text, #101828)" }}>{a.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: s.bg, color: s.color }}>{a.type}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                        background: a.isPublished ? "#f0fdf4" : "#f1f5f9",
                        color: a.isPublished ? "#059669" : "#64748b" }}>
                        {a.isPublished ? "Yayında" : "Taslak"}
                      </span>
                    </div>
                    {a.body && <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{a.body}</div>}
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, display: "flex", gap: 12 }}>
                      <span>{fmtDate(a.createdAtUtc)}</span>
                      <span>👁 {a.readCount} salon okudu</span>
                      {a.expiresAtUtc && <span>Son: {fmtDate(a.expiresAtUtc)}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => toggle(a.id)} style={{
                      padding: "5px 10px", borderRadius: 8, border: "1px solid #e4e7ec",
                      background: "var(--surface-2, #f8fafc)", fontSize: 11, fontWeight: 600, cursor: "pointer",
                      color: a.isPublished ? "#b42318" : "#059669",
                    }}>{a.isPublished ? "Gizle" : "Yayınla"}</button>
                    <button onClick={() => del(a.id)} style={{
                      padding: "5px 10px", borderRadius: 8, border: "none",
                      background: "#fef3f2", color: "#b42318", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    }}>Sil</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Ticket = {
  id: string; salonId: string; salonName: string;
  subject: string; body: string; pageUrl?: string; status: string;
  createdAtUtc: string; updatedAtUtc: string; replyCount: number;
  replies: { id: string; body: string; isFromAdmin: boolean; authorName: string; createdAtUtc: string }[];
};

function SupportTab() {
  const [tickets,  setTickets]  = useState<Ticket[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [filter,   setFilter]   = useState("Open");
  const [reply,    setReply]    = useState("");
  const [sending,  setSending]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch(`/superadmin/support?status=${filter}`);
    if (r.ok) setTickets(await r.json());
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    await apiFetch(`/superadmin/support/${selected.id}/reply`, {
      method: "POST", body: JSON.stringify({ body: reply.trim() }),
    });
    setSending(false);
    setReply("");
    await load();
  };

  const updateStatus = async (id: string, status: string) => {
    await apiFetch(`/superadmin/support/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
    if (selected?.id === id) setSelected(p => p ? { ...p, status } : null);
  };

  const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
    Open:       { color: "#b42318", bg: "#fef3f2", label: "Açık" },
    InProgress: { color: "#d97706", bg: "#fffbeb", label: "İşlemde" },
    Resolved:   { color: "#059669", bg: "#f0fdf4", label: "Çözüldü" },
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: selected ? "320px 1fr" : "1fr", gap: 16, alignItems: "start" }}>
      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {["Open","InProgress","Resolved"].map(s => {
            const st = STATUS_STYLE[s];
            return (
              <button key={s} onClick={() => setFilter(s)} style={{
                padding: "6px 12px", borderRadius: 8, border: `1px solid ${filter === s ? st.color : "#e4e7ec"}`,
                background: filter === s ? st.bg : "var(--surface, #fff)",
                color: filter === s ? st.color : "#64748b",
                fontWeight: filter === s ? 700 : 500, fontSize: 12, cursor: "pointer",
              }}>{st.label}</button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Yükleniyor...</div>
        ) : tickets.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🎫</div>
            Talep yok
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tickets.map(t => {
              const st = STATUS_STYLE[t.status] ?? STATUS_STYLE.Open;
              return (
                <div key={t.id} onClick={() => setSelected(t)} style={{
                  background: "var(--surface, #fff)", border: "1px solid",
                  borderColor: selected?.id === t.id ? "#7c3aed" : "#eaecf0",
                  borderRadius: 12, padding: 14, cursor: "pointer",
                  boxShadow: selected?.id === t.id ? "0 0 0 3px #7c3aed22" : "none",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text, #101828)" }}>{t.subject}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600, marginTop: 2 }}>{t.salonName}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, display: "flex", gap: 10 }}>
                    <span>{fmtDate(t.createdAtUtc)}</span>
                    {t.replyCount > 0 && <span>💬 {t.replyCount}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ background: "var(--surface, #fff)", border: "1px solid #eaecf0", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f2f4f7", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text, #101828)" }}>{selected.subject}</div>
              <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600, marginTop: 2 }}>{selected.salonName}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {["Open","InProgress","Resolved"].map(s => (
                <button key={s} onClick={() => updateStatus(selected.id, s)}
                  disabled={selected.status === s}
                  style={{
                    padding: "4px 10px", borderRadius: 8, border: "1px solid #e4e7ec",
                    background: selected.status === s ? "#7c3aed" : "var(--surface-2, #f8fafc)",
                    color: selected.status === s ? "#fff" : "#64748b",
                    fontSize: 11, fontWeight: 600, cursor: selected.status === s ? "default" : "pointer",
                  }}>{STATUS_STYLE[s].label}</button>
              ))}
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 18 }}>✕</button>
            </div>
          </div>

          <div style={{ padding: 20, maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#f8fafc", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Salon mesajı · {fmtDate(selected.createdAtUtc)}</div>
              <div style={{ fontSize: 13, color: "var(--text, #101828)", lineHeight: 1.5 }}>{selected.body}</div>
            </div>
            {selected.replies.map(r => (
              <div key={r.id} style={{
                background: r.isFromAdmin ? "#eff8ff" : "#f8fafc",
                borderRadius: 12, padding: 14,
                marginLeft: r.isFromAdmin ? 20 : 0,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: r.isFromAdmin ? "#1d4ed8" : "#64748b", marginBottom: 6 }}>
                  {r.authorName} · {fmtDate(r.createdAtUtc)}
                  {r.isFromAdmin && <span style={{ marginLeft: 6, fontSize: 10, background: "#bfdbfe", color: "#1d4ed8", padding: "1px 6px", borderRadius: 999 }}>Admin</span>}
                </div>
                <div style={{ fontSize: 13, color: "var(--text, #101828)", lineHeight: 1.5 }}>{r.body}</div>
              </div>
            ))}
          </div>

          {selected.status !== "Resolved" && (
            <div style={{ padding: "12px 20px", borderTop: "1px solid #f2f4f7" }}>
              <textarea value={reply} onChange={e => setReply(e.target.value)}
                placeholder="Yanıt yaz..."
                rows={3}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button onClick={sendReply} disabled={sending || !reply.trim()} style={{
                  padding: "9px 20px", borderRadius: 10, border: "none",
                  background: !reply.trim() ? "#e2e8f0" : "#1d4ed8",
                  color: !reply.trim() ? "#94a3b8" : "#fff",
                  fontWeight: 700, fontSize: 13, cursor: reply.trim() ? "pointer" : "not-allowed",
                }}>
                  {sending ? "Gönderiliyor..." : "Yanıtla"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SalonDetail({ salon, onClose, onUpdated, onMessage, tab, setTab }: {
  salon: Salon;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onMessage: (m: string) => void;
  tab: "general" | "modules" | "users";
  setTab: (t: "general" | "modules" | "users") => void;
}) {
  return (
    <div style={{ ...card, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #eaecf0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{salon.name}</div>
          <div style={{ fontSize: 12, color: "#667085", marginTop: 2 }}>{salon.id}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#667085" }}>✕</button>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #eaecf0", padding: "0 20px" }}>
        {(["general","modules","users"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "12px 16px", border: "none", background: "none", cursor: "pointer",
            fontSize: 13, fontWeight: tab === t ? 700 : 500,
            color: tab === t ? "#7c3aed" : "#667085",
            borderBottom: tab === t ? "2px solid #7c3aed" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {t === "general" ? "⚙ Genel" : t === "modules" ? "📦 Modüller" : "👤 Kullanıcılar"}
          </button>
        ))}
      </div>

      <div style={{ padding: 20 }}>
        {tab === "general"  && <GeneralTab  salon={salon} onUpdated={onUpdated} onMessage={onMessage} />}
        {tab === "modules"  && <ModulesTab  salonId={salon.id} onMessage={onMessage} />}
        {tab === "users"    && <SalonUsersTab salonId={salon.id} />}
      </div>
    </div>
  );
}

function GeneralTab({ salon, onUpdated, onMessage }: {
  salon: Salon;
  onUpdated: () => Promise<void>;
  onMessage: (m: string) => void;
}) {
  const [name,        setName]        = useState(salon.name);
  const [city,        setCity]        = useState(salon.city ?? "");
  const [country,     setCountry]     = useState(salon.country ?? "");
  const [emailDomain, setEmailDomain] = useState(salon.emailDomain ?? "");
  const [isActive,    setIsActive]    = useState(salon.isActive);
  const [saving,      setSaving]      = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await apiFetch(`/superadmin/salons/${salon.id}`, {
      method: "PUT",
      body: JSON.stringify({ name, city, country, isActive, emailDomain: emailDomain.trim().toLowerCase() || null }),
    });
    setSaving(false);
    if (res.ok) { onMessage("Salon güncellendi."); await onUpdated(); }
    else        { const d = await res.json().catch(() => ({})); onMessage(d.message ?? "Hata."); }
  };

  const statRow = (label: string, val: string | number) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f2f4f7", fontSize: 13 }}>
      <span style={{ color: "#667085" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "var(--text, #101828)" }}>{val}</span>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 6 }}>Salon Adı *</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inp} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 6 }}>Şehir</label>
            <input value={city} onChange={e => setCity(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 6 }}>Ülke</label>
            <input value={country} onChange={e => setCountry(e.target.value)} style={inp} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 6 }}>E-posta Domain</label>
          <input value={emailDomain} onChange={e => setEmailDomain(e.target.value.trim().toLowerCase())} placeholder="ör: salon-a.com.tr" style={inp} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2, #344054)" }}>Salon Durumu</label>
          <button onClick={() => setIsActive(v => !v)} style={{
            padding: "6px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
            background: isActive ? "#059669" : "#dc2626", color: "#fff", transition: "background 0.2s",
          }}>
            {isActive ? "● Aktif" : "● Pasif"}
          </button>
        </div>
        <button onClick={save} disabled={saving} style={{
          padding: "10px 20px", borderRadius: 10, border: "none",
          background: saving ? "#a78bfa" : "#7c3aed", color: "#fff",
          fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, width: "fit-content",
        }}>
          {saving ? "Kaydediliyor..." : "💾 Kaydet"}
        </button>
      </div>

      <div style={{ background: "var(--surface-2, #f8fafc)", borderRadius: 12, padding: "4px 16px" }}>
        {statRow("Kullanıcı Sayısı", salon.userCount)}
        {statRow("Müşteri Sayısı", salon.customerCount)}
        {statRow("Aktif Modül", salon.activeModules.length)}
        {statRow("Oluşturulma", fmtDate(salon.createdAtUtc))}
      </div>
    </div>
  );
}

function ModulesTab({ salonId, onMessage }: { salonId: string; onMessage: (m: string) => void }) {
  const [modules,  setModules]  = useState<Module[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expiries, setExpiries] = useState<Record<string, string>>({});
  const [saving,   setSaving]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`/superadmin/salons/${salonId}/modules`);
    if (res.ok) {
      const data: Module[] = await res.json();
      setModules(data);
      const init: Record<string, string> = {};
      data.forEach(m => { init[m.moduleCode] = m.expiresAtUtc ? m.expiresAtUtc.slice(0, 10) : ""; });
      setExpiries(init);
    }
    setLoading(false);
  }, [salonId]);

  useEffect(() => { load(); }, [load]);

  const saveModule = async (code: string, isActive: boolean) => {
    setSaving(code);
    const expiresAt = expiries[code] ? new Date(expiries[code]).toISOString() : null;
    await apiFetch("/superadmin/modules/toggle", {
      method: "PUT",
      body: JSON.stringify({ salonId, moduleCode: code, isActive, expiresAtUtc: expiresAt }),
    });
    onMessage(`${code} modülü güncellendi.`);
    await load();
    setSaving(null);
  };

  const setAllModules = async (active: boolean) => {
    for (const m of modules) {
      await apiFetch("/superadmin/modules/toggle", {
        method: "PUT",
        body: JSON.stringify({ salonId, moduleCode: m.moduleCode, isActive: active, expiresAtUtc: null }),
      });
    }
    onMessage(active ? "Tüm modüller aktifleştirildi." : "Tüm modüller deaktif edildi.");
    await load();
  };

  if (loading) return <div style={{ color: "#98a2b3", fontSize: 13 }}>Yükleniyor...</div>;

  const activeCount = modules.filter(m => m.isActive).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: "#667085" }}>{activeCount} / {modules.length} modül aktif</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setAllModules(true)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#059669", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
            Tümünü Aktifleştir
          </button>
          <button onClick={() => setAllModules(false)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef3f2", color: "#b42318", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
            Tümünü Kapat
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {modules.map(m => {
          const es = expiryStatus(m.isActive ? m.expiresAtUtc : undefined);
          const isSaving = saving === m.moduleCode;
          return (
            <div key={m.moduleCode} style={{
              padding: "12px 14px", borderRadius: 12,
              background: m.isActive ? "#faf5ff" : "#f8fafc",
              border: `1px solid ${m.isActive ? "#e9d5ff" : "#eaecf0"}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => saveModule(m.moduleCode, !m.isActive)} disabled={isSaving}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                    background: m.isActive ? "#7c3aed" : "#d1d5db",
                    position: "relative", flexShrink: 0, transition: "background 0.2s",
                  }}>
                  <span style={{
                    position: "absolute", top: 3, width: 18, height: 18,
                    borderRadius: "50%", background: "var(--surface, #fff)",
                    left: m.isActive ? 23 : 3, transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: m.isActive ? "#6d28d9" : "#374151" }}>{m.moduleLabel}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{m.moduleCode}</div>
                </div>
                {m.isActive && (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: es.bg, color: es.color, flexShrink: 0 }}>
                    {es.label}
                  </span>
                )}
              </div>
              {m.isActive && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#667085", flexShrink: 0 }}>Son Kullanım:</label>
                  <input type="date" value={expiries[m.moduleCode] ?? ""}
                    onChange={e => setExpiries(p => ({ ...p, [m.moduleCode]: e.target.value }))}
                    min={new Date().toISOString().slice(0, 10)}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e4e7ec", fontSize: 12, flex: 1 }} />
                  <button onClick={() => setExpiries(p => ({ ...p, [m.moduleCode]: "" }))}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e4e7ec", background: "var(--surface-2, #f8fafc)", color: "#667085", cursor: "pointer", fontSize: 11 }}>
                    Süresiz
                  </button>
                  <button onClick={() => saveModule(m.moduleCode, true)} disabled={isSaving}
                    style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, cursor: isSaving ? "not-allowed" : "pointer", fontSize: 11 }}>
                    {isSaving ? "..." : "Kaydet"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SalonUsersTab({ salonId }: { salonId: string }) {
  const [users,   setUsers]   = useState<SalonUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/superadmin/salons/${salonId}/users`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false); });
  }, [salonId]);

  const ROLE_COLORS: Record<string, string> = {
    SuperAdmin: "#7c3aed", SalonYonetici: "#1d4ed8",
    Stilist: "#065f46", Kasiyer: "#92400e", Resepsiyon: "#0e7490",
  };

  if (loading) return <div style={{ color: "#98a2b3", fontSize: 13 }}>Yükleniyor...</div>;
  if (users.length === 0) return <div style={{ color: "#98a2b3", fontSize: 13, padding: 16, textAlign: "center" }}>Kullanıcı bulunamadı.</div>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {users.map(u => {
        const rc = ROLE_COLORS[u.roleName] ?? "#374151";
        return (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface-2, #f8fafc)", borderRadius: 10, border: "1px solid #f2f4f7" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: rc, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
              {u.fullName.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text, #101828)" }}>{u.fullName}</div>
              <div style={{ fontSize: 11, color: "#667085" }}>{u.userName} · {u.email}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: `${rc}18`, color: rc, border: `1px solid ${rc}30` }}>
                {u.roleName}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                background: u.isActive ? "#f0fdf4" : "#fef3f2",
                color: u.isActive ? "#059669" : "#b42318" }}>
                {u.isActive ? "Aktif" : "Pasif"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
