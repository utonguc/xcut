"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import AppShell from "@/components/AppShell";
import RoleGuard from "@/components/RoleGuard";
import { apiFetch, enterImpersonation } from "@/lib/api";
import { btn, inp } from "@/lib/ui";
import { fmtDate } from "@/lib/tz";
import { APP_VERSION } from "@/lib/version";
import { useToast } from "@/components/Toast";

type Salon = {
  id: string; name: string; city?: string; country?: string;
  emailDomain?: string; plan?: string; trialEndsAtUtc?: string; saNote?: string;
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
  { code: "appointments", label: "Randevu Yönetimi" },
  { code: "customers",    label: "Müşteri Yönetimi" },
  { code: "staff",        label: "Personel & Stilistler" },
  { code: "services",     label: "Hizmet Kataloğu" },
  { code: "stock",        label: "Stok Yönetimi" },
  { code: "tasks",        label: "Görev Yönetimi" },
  { code: "kasa",         label: "Kasa & POS" },
  { code: "finance",      label: "Finans & Faturalama" },
  { code: "reports",      label: "Raporlama" },
  { code: "whatsapp",     label: "WhatsApp Entegrasyonu" },
  { code: "audit",        label: "Denetim Logu" },
  { code: "website",      label: "Web Sitesi" },
  { code: "crm",          label: "CRM & Toplu İletişim" },
  { code: "settings",     label: "Ayarlar" },
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
  initialModules: ["appointments","customers","staff","services","stock","tasks","kasa","finance","reports","crm"] as string[],
});

export default function SuperAdminPage() {
  return (
    <RoleGuard roles={["SuperAdmin"]}>
      <SuperAdminPageInner />
    </RoleGuard>
  );
}

function SuperAdminPageInner() {
  const [topTab, setTopTab] = useState<"salons"|"announcements"|"support"|"ai"|"smtp">("salons");

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
    const snapshot = { ...form };
    try {
      const res = await apiFetch("/superadmin/salons", { method: "POST", body: JSON.stringify(snapshot) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? "Hata"); }
      setShowCreate(false); setForm(emptyForm());
      setMessage("Salon oluşturuldu."); await load();
      if (snapshot.adminEmail) {
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: "new_account",
            to: snapshot.adminEmail,
            subject: `${snapshot.name} için xCut Hesabınız Oluşturuldu`,
            data: {
              fullName: snapshot.adminFullName,
              salonName: snapshot.name,
              userName: snapshot.adminUserName,
              password: snapshot.adminPassword,
              loginUrl: "https://xcut.xshield.com.tr/login",
            },
          }),
        }).catch(() => {});
      }
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
            { key: "ai",            label: "🤖 AI Asistan" },
            { key: "smtp",          label: "📧 E-posta" },
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
      {topTab === "ai"            && <AIAssistantTab />}
      {topTab === "smtp"          && <SmtpSettingsTab />}

      {topTab === "salons" && <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "start" }}>

        <div style={{ flex: "1 1 280px" }}>
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
                <input placeholder="Salon adı *" value={form.name} onChange={e => f("name", e.target.value)} style={inp()} required />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input placeholder="Şehir" value={form.city} onChange={e => f("city", e.target.value)} style={inp()} />
                  <input placeholder="Ülke" value={form.country} onChange={e => f("country", e.target.value)} style={inp()} />
                </div>
                <div>
                  <input
                    placeholder="E-posta domain (ör: salon-a.com.tr)"
                    value={form.emailDomain}
                    onChange={e => f("emailDomain", e.target.value.trim().toLowerCase())}
                    style={inp()}
                  />
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    Personel bu domain'deki e-postalarıyla giriş yapar.
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6d28d9", marginTop: 4 }}>Yönetici Hesabı</div>
                <input placeholder="Ad Soyad *" value={form.adminFullName} onChange={e => f("adminFullName", e.target.value)} style={inp()} required />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input placeholder="Kullanıcı adı *" value={form.adminUserName} onChange={e => f("adminUserName", e.target.value)} style={inp()} required />
                  <input placeholder="E-posta" value={form.adminEmail} onChange={e => f("adminEmail", e.target.value)} style={inp()} />
                </div>
                <input type="password" placeholder="Şifre * (min 6)" value={form.adminPassword} onChange={e => f("adminPassword", e.target.value)} style={inp()} required minLength={6} />

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

                <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 11, color: "#94a3b8", flexWrap: "wrap" }}>
                  <span>👤 {s.userCount}</span>
                  <span>💇 {s.customerCount}</span>
                  <span>📦 {s.activeModules.length} modül</span>
                  {s.plan && (
                    <span style={{ background: "#ede9fe", color: "#7c3aed", borderRadius: 999, padding: "1px 7px", fontWeight: 700 }}>
                      {s.plan}
                    </span>
                  )}
                  {s.trialEndsAtUtc && (() => {
                    const d = Math.ceil((new Date(s.trialEndsAtUtc).getTime() - Date.now()) / 86400000);
                    return (
                      <span style={{ background: d < 0 ? "#fef3f2" : d <= 7 ? "#fffbeb" : "#f0fdf4", color: d < 0 ? "#b42318" : d <= 7 ? "#d97706" : "#059669", borderRadius: 999, padding: "1px 7px", fontWeight: 600 }}>
                        {d < 0 ? "Süresi doldu" : `${d}g`}
                      </span>
                    );
                  })()}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ color: "#98a2b3", fontSize: 13, padding: 24, textAlign: "center" }}>Salon bulunamadı.</div>
            )}
          </div>
        </div>

        {selected && (
          <div style={{ flex: "2 1 320px" }}>
          <SalonDetail
            salon={selected}
            allSalons={salons}
            onClose={() => setSelected(null)}
            onUpdated={async () => { await load(); }}
            onMessage={setMessage}
            tab={detailTab}
            setTab={setDetailTab}
          />
          </div>
        )}
      </div>}
    </AppShell>
  );
}

type Announcement = {
  id: string; title: string; body?: string; type: string;
  isPublished: boolean; priority: number;
  startsAtUtc?: string; expiresAtUtc?: string;
  excludedSalonIds: string; isRecurring: boolean;
  recurrenceType?: string; recurrenceDays?: string;
  recurrenceStartTime?: string; recurrenceEndTime?: string;
  createdAtUtc: string; readCount: number;
};

type SalonMini = { id: string; name: string };

const BLANK_FORM = {
  title: "", body: "", type: "info", priority: 0, isPublished: true,
  startsAtUtc: "", expiresAtUtc: "",
  excludedSalonIds: [] as string[],
  isRecurring: false, recurrenceType: "daily",
  recurrenceDays: [] as string[], recurrenceStartTime: "09:00", recurrenceEndTime: "18:00",
};

function AnnouncementsTab() {
  const { confirm, toast } = useToast();
  const [items,    setItems]    = useState<Announcement[]>([]);
  const [salons,   setSalons]   = useState<SalonMini[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [form,     setForm]     = useState({ ...BLANK_FORM });
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      apiFetch("/superadmin/announcements"),
      apiFetch("/superadmin/salons"),
    ]);
    if (r1.ok) setItems(await r1.json());
    if (r2.ok) setSalons(await r2.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...BLANK_FORM });
    setShowForm(true);
  };

  const openEdit = (a: Announcement) => {
    setEditId(a.id);
    let excl: string[] = [];
    try { excl = JSON.parse(a.excludedSalonIds ?? "[]"); } catch { excl = []; }
    setForm({
      title: a.title, body: a.body ?? "", type: a.type, priority: a.priority,
      isPublished: a.isPublished,
      startsAtUtc: a.startsAtUtc ? a.startsAtUtc.slice(0, 10) : "",
      expiresAtUtc: a.expiresAtUtc ? a.expiresAtUtc.slice(0, 10) : "",
      excludedSalonIds: excl,
      isRecurring: a.isRecurring, recurrenceType: a.recurrenceType ?? "daily",
      recurrenceDays: a.recurrenceDays ? a.recurrenceDays.split(",").filter(Boolean) : [],
      recurrenceStartTime: a.recurrenceStartTime ?? "09:00",
      recurrenceEndTime: a.recurrenceEndTime ?? "18:00",
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("Başlık zorunlu."); return; }
    setSaving(true);
    const body = {
      title: form.title, body: form.body || null, type: form.type,
      priority: form.priority, isPublished: form.isPublished,
      startsAtUtc:  form.startsAtUtc  ? new Date(form.startsAtUtc).toISOString()  : null,
      expiresAtUtc: form.expiresAtUtc ? new Date(form.expiresAtUtc).toISOString() : null,
      excludedSalonIds: JSON.stringify(form.excludedSalonIds),
      isRecurring: form.isRecurring,
      recurrenceType: form.isRecurring ? form.recurrenceType : null,
      recurrenceDays: form.isRecurring && form.recurrenceType === "weekly" ? form.recurrenceDays.join(",") : null,
      recurrenceStartTime: form.isRecurring ? form.recurrenceStartTime : null,
      recurrenceEndTime:   form.isRecurring ? form.recurrenceEndTime   : null,
    };
    const r = await apiFetch(
      editId ? `/superadmin/announcements/${editId}` : "/superadmin/announcements",
      { method: editId ? "PUT" : "POST", body: JSON.stringify(body) }
    );
    setSaving(false);
    if (r.ok) {
      toast.success(editId ? "Duyuru güncellendi." : "Duyuru oluşturuldu.");
      setShowForm(false); setEditId(null); setForm({ ...BLANK_FORM }); load();
    } else {
      const d = await r.json().catch(() => ({}));
      toast.error(d.message ?? "Hata oluştu.");
    }
  };

  const toggle = async (id: string) => {
    await apiFetch(`/superadmin/announcements/${id}/publish`, { method: "PATCH" });
    load();
  };

  const del = async (id: string) => {
    const ok = await confirm({ message: "Duyuru silinsin mi?", danger: true });
    if (!ok) return;
    await apiFetch(`/superadmin/announcements/${id}`, { method: "DELETE" });
    load();
  };

  const TYPE_OPTS = [
    { value: "info",        label: "Bilgi (mavi)" },
    { value: "success",     label: "Başarı (yeşil)" },
    { value: "warning",     label: "Uyarı (sarı)" },
    { value: "error",       label: "Kritik (kırmızı)" },
    { value: "maintenance", label: "Bakım (turuncu)" },
  ];
  const TYPE_COLOR: Record<string, { color: string; bg: string }> = {
    info:        { color: "#1d4ed8", bg: "#eff8ff" },
    success:     { color: "#059669", bg: "#f0fdf4" },
    warning:     { color: "#d97706", bg: "#fffbeb" },
    error:       { color: "#b42318", bg: "#fef3f2" },
    maintenance: { color: "#c2410c", bg: "#fff7ed" },
  };
  const WEEKDAYS = [
    { v: "1", l: "Pzt" }, { v: "2", l: "Sal" }, { v: "3", l: "Çar" },
    { v: "4", l: "Per" }, { v: "5", l: "Cum" }, { v: "6", l: "Cmt" }, { v: "0", l: "Paz" },
  ];

  const toggleExclude = (id: string) =>
    setForm(p => ({ ...p, excludedSalonIds: p.excludedSalonIds.includes(id) ? p.excludedSalonIds.filter(x => x !== id) : [...p.excludedSalonIds, id] }));
  const toggleDay = (v: string) =>
    setForm(p => ({ ...p, recurrenceDays: p.recurrenceDays.includes(v) ? p.recurrenceDays.filter(x => x !== v) : [...p.recurrenceDays, v] }));

  const lbl = (text: string) => (
    <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>{text}</label>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#64748b" }}>{items.length} duyuru</div>
        <button onClick={showForm ? () => setShowForm(false) : openCreate} style={{
          padding: "9px 18px", borderRadius: 10, border: "none",
          background: "#7c3aed", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13,
        }}>
          {showForm ? "✕ Kapat" : "+ Yeni Duyuru"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#6d28d9", marginBottom: 14 }}>
            {editId ? "Duyuruyu Düzenle" : "Yeni Duyuru"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Başlık */}
            <div>
              {lbl("Başlık *")}
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Duyuru başlığı" style={inp()} />
            </div>
            {/* İçerik */}
            <div>
              {lbl("İçerik")}
              <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                placeholder="Duyuru metni (isteğe bağlı)" rows={3}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
            </div>
            {/* Tür + Öncelik + Yayın */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                {lbl("Tür")}
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inp()}>
                  {TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                {lbl("Öncelik")}
                <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: Number(e.target.value) }))} style={inp()}>
                  <option value={0}>Normal</option>
                  <option value={1}>Yüksek</option>
                  <option value={2}>Acil</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={form.isPublished} onChange={e => setForm(p => ({ ...p, isPublished: e.target.checked }))} />
                  Hemen Yayınla
                </label>
              </div>
            </div>
            {/* Tarih aralığı */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                {lbl("Başlangıç Tarihi")}
                <input type="date" value={form.startsAtUtc} onChange={e => setForm(p => ({ ...p, startsAtUtc: e.target.value }))} style={inp()} />
              </div>
              <div>
                {lbl("Bitiş Tarihi")}
                <input type="date" value={form.expiresAtUtc} onChange={e => setForm(p => ({ ...p, expiresAtUtc: e.target.value }))} style={inp()} />
              </div>
            </div>
            {/* Tekrarlama */}
            <div style={{ background: "#fff", border: "1px solid #e9d5ff", borderRadius: 10, padding: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, marginBottom: form.isRecurring ? 12 : 0 }}>
                <input type="checkbox" checked={form.isRecurring} onChange={e => setForm(p => ({ ...p, isRecurring: e.target.checked }))} />
                Tekrarlayan Duyuru
              </label>
              {form.isRecurring && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      {lbl("Tekrar Türü")}
                      <select value={form.recurrenceType} onChange={e => setForm(p => ({ ...p, recurrenceType: e.target.value }))} style={inp()}>
                        <option value="daily">Günlük</option>
                        <option value="weekly">Haftalık</option>
                        <option value="monthly">Aylık</option>
                      </select>
                    </div>
                    <div>
                      {lbl("Başlangıç Saati")}
                      <input type="time" value={form.recurrenceStartTime} onChange={e => setForm(p => ({ ...p, recurrenceStartTime: e.target.value }))} style={inp()} />
                    </div>
                    <div>
                      {lbl("Bitiş Saati")}
                      <input type="time" value={form.recurrenceEndTime} onChange={e => setForm(p => ({ ...p, recurrenceEndTime: e.target.value }))} style={inp()} />
                    </div>
                  </div>
                  {form.recurrenceType === "weekly" && (
                    <div>
                      {lbl("Günler")}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {WEEKDAYS.map(d => (
                          <button key={d.v} type="button" onClick={() => toggleDay(d.v)} style={{
                            padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                            border: "1px solid",
                            borderColor: form.recurrenceDays.includes(d.v) ? "#7c3aed" : "#e4e7ec",
                            background: form.recurrenceDays.includes(d.v) ? "#ede9fe" : "var(--surface,#fff)",
                            color: form.recurrenceDays.includes(d.v) ? "#6d28d9" : "#64748b",
                          }}>{d.l}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Salon dışlamaları */}
            {salons.length > 0 && (
              <div>
                {lbl(`Salon Dışlamaları (${form.excludedSalonIds.length} dışlandı — boş bırakılırsa herkese gösterilir)`)}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 140, overflowY: "auto", padding: "8px 0" }}>
                  {salons.map(s => (
                    <button key={s.id} type="button" onClick={() => toggleExclude(s.id)} style={{
                      padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      border: "1px solid",
                      borderColor: form.excludedSalonIds.includes(s.id) ? "#b42318" : "#e4e7ec",
                      background: form.excludedSalonIds.includes(s.id) ? "#fef3f2" : "var(--surface,#fff)",
                      color: form.excludedSalonIds.includes(s.id) ? "#b42318" : "#64748b",
                    }}>
                      {form.excludedSalonIds.includes(s.id) ? "✕ " : ""}{s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Butonlar */}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={save} disabled={saving} style={{
                padding: "9px 18px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff",
                fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: 13,
              }}>{saving ? "Kaydediliyor..." : editId ? "Güncelle" : "Oluştur"}</button>
              <button onClick={() => { setShowForm(false); setEditId(null); }} style={{
                padding: "9px 14px", borderRadius: 10, border: "1px solid #d0d5dd",
                background: "var(--surface,#fff)", color: "var(--text-2,#344054)", fontWeight: 600, cursor: "pointer", fontSize: 13,
              }}>İptal</button>
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
            let excl: string[] = [];
            try { excl = JSON.parse(a.excludedSalonIds ?? "[]"); } catch { excl = []; }
            return (
              <div key={a.id} style={{ background: "var(--surface,#fff)", border: "1px solid #eaecf0", borderRadius: 14, padding: 16, borderLeft: `4px solid ${s.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text,#101828)" }}>{a.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: s.bg, color: s.color }}>{a.type}</span>
                      {a.priority > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#fffbeb", color: "#d97706" }}>{a.priority === 2 ? "Acil" : "Yüksek"}</span>}
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                        background: a.isPublished ? "#f0fdf4" : "#f1f5f9",
                        color: a.isPublished ? "#059669" : "#64748b" }}>
                        {a.isPublished ? "Yayında" : "Taslak"}
                      </span>
                      {a.isRecurring && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#eff8ff", color: "#1d4ed8" }}>🔄 Tekrarlayan</span>}
                      {excl.length > 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#f1f5f9", color: "#64748b" }}>{excl.length} salon hariç</span>}
                    </div>
                    {a.body && <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{a.body}</div>}
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span>{fmtDate(a.createdAtUtc)}</span>
                      <span>👁 {a.readCount} salon okudu</span>
                      {a.startsAtUtc  && <span>Başlar: {fmtDate(a.startsAtUtc)}</span>}
                      {a.expiresAtUtc && <span>Biter: {fmtDate(a.expiresAtUtc)}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openEdit(a)} style={{
                      padding: "5px 10px", borderRadius: 8, border: "1px solid #e4e7ec",
                      background: "var(--surface-2,#f8fafc)", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#344054",
                    }}>Düzenle</button>
                    <button onClick={() => toggle(a.id)} style={{
                      padding: "5px 10px", borderRadius: 8, border: "1px solid #e4e7ec",
                      background: "var(--surface-2,#f8fafc)", fontSize: 11, fontWeight: 600, cursor: "pointer",
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

type TicketMsg = { id: string; body: string; isFromAdmin: boolean; authorName: string; createdAtUtc: string };
type Ticket = {
  id: string; salonId: string; salonName: string; userName: string;
  subject: string; pageContext?: string; status: string;
  createdAtUtc: string; updatedAtUtc: string; messageCount: number;
  messages: TicketMsg[];
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
                    {t.messageCount > 0 && <span>💬 {t.messageCount}</span>}
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
            {selected.pageContext && (
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "6px 12px", fontSize: 11, color: "#64748b" }}>
                📍 Sayfa: <strong>{selected.pageContext}</strong>
              </div>
            )}
            {selected.messages.map(m => (
              <div key={m.id} style={{
                background: m.isFromAdmin ? "#eff8ff" : "#f8fafc",
                borderRadius: 12, padding: 14,
                marginLeft: m.isFromAdmin ? 20 : 0,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: m.isFromAdmin ? "#1d4ed8" : "#64748b", marginBottom: 6 }}>
                  {m.authorName} · {fmtDate(m.createdAtUtc)}
                  {m.isFromAdmin && <span style={{ marginLeft: 6, fontSize: 10, background: "#bfdbfe", color: "#1d4ed8", padding: "1px 6px", borderRadius: 999 }}>Admin</span>}
                </div>
                <div style={{ fontSize: 13, color: "var(--text, #101828)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.body}</div>
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

function SalonDetail({ salon, allSalons, onClose, onUpdated, onMessage, tab, setTab }: {
  salon: Salon;
  allSalons: Salon[];
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onMessage: (m: string) => void;
  tab: "general" | "modules" | "users";
  setTab: (t: "general" | "modules" | "users") => void;
}) {
  const [impersonating, setImpersonating] = useState(false);

  const handleImpersonate = async () => {
    setImpersonating(true);
    try {
      const res = await apiFetch(`/superadmin/salons/${salon.id}/impersonate`, { method: "POST", body: JSON.stringify({}) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); onMessage(d.message ?? "Bağlantı kurulamadı."); return; }
      const data = await res.json();
      enterImpersonation(data.accessToken, salon.name);
      window.location.href = "/dashboard";
    } finally { setImpersonating(false); }
  };

  return (
    <div style={{ ...card, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #eaecf0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{salon.name}</div>
          <div style={{ fontSize: 12, color: "#667085", marginTop: 2 }}>{salon.id}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={handleImpersonate}
            disabled={!salon.isActive || impersonating}
            title={!salon.isActive ? "Salon pasif" : "Bu salon adına giriş yap"}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "none", cursor: salon.isActive ? "pointer" : "not-allowed",
              background: salon.isActive ? "#7c3aed" : "#d1d5db", color: "#fff",
              fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 6,
              opacity: impersonating ? 0.7 : 1,
            }}
          >
            🔐 {impersonating ? "Bağlanıyor..." : "Salona Bağlan"}
          </button>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#667085" }}>✕</button>
        </div>
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
        {tab === "users"    && <SalonUsersTab salonId={salon.id} allSalons={allSalons} />}
      </div>
    </div>
  );
}

const PLANS = [
  { value: "trial",   label: "Trial (Deneme)" },
  { value: "starter", label: "Starter" },
  { value: "salon",   label: "Salon" },
  { value: "pro",     label: "Pro" },
];

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
  const [plan,        setPlan]        = useState(salon.plan ?? "trial");
  const [trialEnds,   setTrialEnds]   = useState(
    salon.trialEndsAtUtc ? salon.trialEndsAtUtc.slice(0, 10) : ""
  );
  const [saNote,      setSaNote]      = useState(salon.saNote ?? "");
  const [saving,      setSaving]      = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await apiFetch(`/superadmin/salons/${salon.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name, city, country, isActive,
        emailDomain: emailDomain.trim().toLowerCase() || null,
        plan,
        trialEndsAtUtc: trialEnds ? new Date(trialEnds).toISOString() : null,
        saNote: saNote.trim() || null,
      }),
    });
    setSaving(false);
    if (res.ok) { onMessage("Salon güncellendi."); await onUpdated(); }
    else        { const d = await res.json().catch(() => ({})); onMessage(d.message ?? "Hata."); }
  };

  const trialDaysLeft = salon.trialEndsAtUtc
    ? Math.ceil((new Date(salon.trialEndsAtUtc).getTime() - Date.now()) / 86400000)
    : null;

  const statRow = (label: string, val: string | number, color?: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f2f4f7", fontSize: 13 }}>
      <span style={{ color: "#667085" }}>{label}</span>
      <span style={{ fontWeight: 600, color: color ?? "var(--text, #101828)" }}>{val}</span>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 6 }}>Salon Adı *</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inp()} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 6 }}>Şehir</label>
            <input value={city} onChange={e => setCity(e.target.value)} style={inp()} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 6 }}>Ülke</label>
            <input value={country} onChange={e => setCountry(e.target.value)} style={inp()} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 6 }}>E-posta Domain</label>
          <input value={emailDomain} onChange={e => setEmailDomain(e.target.value.trim().toLowerCase())} placeholder="ör: salon-a.com.tr" style={inp()} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 6 }}>Plan</label>
            <select value={plan} onChange={e => setPlan(e.target.value)} style={inp()}>
              {PLANS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 6 }}>Deneme Bitiş Tarihi</label>
            <input type="date" value={trialEnds} onChange={e => setTrialEnds(e.target.value)} style={inp()} />
          </div>
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

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 6 }}>SA Notu (sadece SuperAdmin görür)</label>
          <textarea value={saNote} onChange={e => setSaNote(e.target.value)}
            placeholder="Salon hakkında iç notlar..."
            rows={3}
            style={{ ...inp(), resize: "vertical", minHeight: 72 }} />
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
        {statRow("Aktif Modül", `${salon.activeModules.length} / 14`)}
        {statRow("Mevcut Plan", salon.plan ?? "—", "#7c3aed")}
        {trialDaysLeft !== null && statRow(
          "Deneme Süresi",
          trialDaysLeft < 0 ? "Süresi dolmuş" : `${trialDaysLeft} gün kaldı`,
          trialDaysLeft < 0 ? "#b42318" : trialDaysLeft <= 7 ? "#d97706" : "#059669"
        )}
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

function SalonUsersTab({ salonId, allSalons }: { salonId: string; allSalons: Salon[] }) {
  const [users,         setUsers]         = useState<SalonUser[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [resetUserId,   setResetUserId]   = useState<string | null>(null);
  const [newPassword,   setNewPassword]   = useState("");
  const [resetting,     setResetting]     = useState(false);
  const [message,       setMessage]       = useState("");
  const [accessUserId,  setAccessUserId]  = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/superadmin/salons/${salonId}/users`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false); });
  }, [salonId]);

  const resetPassword = async (userId: string) => {
    if (!newPassword || newPassword.length < 6) { setMessage("Şifre en az 6 karakter olmalı."); return; }
    setResetting(true);
    const res = await apiFetch(`/superadmin/salons/${salonId}/users/${userId}/reset-password`, {
      method: "PUT",
      body: JSON.stringify({ newPassword }),
    });
    setResetting(false);
    if (res.ok) { setMessage("Şifre güncellendi."); setResetUserId(null); setNewPassword(""); }
    else { const d = await res.json().catch(() => ({})); setMessage(d.message ?? "Hata."); }
  };

  const ROLE_COLORS: Record<string, string> = {
    SuperAdmin: "#7c3aed", SalonYonetici: "#1d4ed8",
    Stilist: "#065f46", Kasiyer: "#92400e", Resepsiyon: "#0e7490",
  };

  if (loading) return <div style={{ color: "#98a2b3", fontSize: 13 }}>Yükleniyor...</div>;
  if (users.length === 0) return <div style={{ color: "#98a2b3", fontSize: 13, padding: 16, textAlign: "center" }}>Kullanıcı bulunamadı.</div>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {message && (
        <div style={{ padding: "8px 14px", borderRadius: 8, background: "#f0fdf4", color: "#059669", border: "1px solid #bbf7d0", fontSize: 13, fontWeight: 600 }}
          onClick={() => setMessage("")}>✓ {message}</div>
      )}
      {users.map(u => {
        const rc = ROLE_COLORS[u.roleName] ?? "#374151";
        const isResetting = resetUserId === u.id;
        return (
          <div key={u.id} style={{ background: "var(--surface-2, #f8fafc)", borderRadius: 10, border: "1px solid #f2f4f7", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
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
                <button
                  onClick={() => { setResetUserId(isResetting ? null : u.id); setNewPassword(""); setMessage(""); setAccessUserId(null); }}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #e4e7ec", background: isResetting ? "#f3f4f6" : "var(--surface,#fff)", color: "#374151", cursor: "pointer", fontWeight: 600, fontSize: 11 }}
                >
                  🔑 Şifre
                </button>
                <button
                  onClick={() => { setAccessUserId(accessUserId === u.id ? null : u.id); setResetUserId(null); setMessage(""); }}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #e4e7ec", background: accessUserId === u.id ? "#ede9fe" : "var(--surface,#fff)", color: accessUserId === u.id ? "#7c3aed" : "#374151", cursor: "pointer", fontWeight: 600, fontSize: 11 }}
                  title="Salon erişimlerini yönet"
                >
                  🏪 Erişim
                </button>
              </div>
            </div>
            {isResetting && (
              <div style={{ padding: "10px 14px", borderTop: "1px solid #f2f4f7", display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="password"
                  placeholder="Yeni şifre (min. 6 karakter)"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, outline: "none" }}
                />
                <button
                  onClick={() => resetPassword(u.id)}
                  disabled={resetting}
                  style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, cursor: resetting ? "not-allowed" : "pointer", fontSize: 12 }}
                >
                  {resetting ? "..." : "Kaydet"}
                </button>
              </div>
            )}
            {accessUserId === u.id && (
              <UserSalonAccessPanel userId={u.id} homeSalonId={salonId} allSalons={allSalons} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────── User Salon Access Panel ──────── */

type SalonAccessEntry = { salonId: string; salonName: string; grantedAtUtc: string };

function UserSalonAccessPanel({ userId, homeSalonId, allSalons }: {
  userId: string;
  homeSalonId: string;
  allSalons: Salon[];
}) {
  const { toast } = useToast();
  const [accesses,  setAccesses]  = useState<SalonAccessEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [addSalon,  setAddSalon]  = useState("");
  const [saving,    setSaving]    = useState(false);

  const load = useCallback(() => {
    apiFetch(`/superadmin/users/${userId}/salon-accesses`)
      .then(r => r.ok ? r.json() : [])
      .then((d: SalonAccessEntry[]) => { setAccesses(Array.isArray(d) ? d : []); setLoading(false); });
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const grant = async () => {
    if (!addSalon) return;
    setSaving(true);
    const r = await apiFetch(`/superadmin/users/${userId}/salon-accesses`, {
      method: "POST",
      body: JSON.stringify({ salonId: addSalon }),
    });
    setSaving(false);
    if (r.ok) { setAddSalon(""); load(); toast.success("Erişim verildi."); }
    else { const d = await r.json().catch(() => ({})); toast.error(d.message ?? "Hata."); }
  };

  const revoke = async (sid: string, sname: string) => {
    const r = await apiFetch(`/superadmin/users/${userId}/salon-accesses/${sid}`, { method: "DELETE" });
    if (r.ok) { load(); toast.success(`${sname} erişimi kaldırıldı.`); }
    else toast.error("Kaldırılamadı.");
  };

  const grantedIds = new Set(accesses.map(a => a.salonId));
  const available  = allSalons.filter(s => s.id !== homeSalonId && !grantedIds.has(s.id));

  return (
    <div style={{ padding: "12px 14px", borderTop: "1px solid #f2f4f7", background: "#fafafa" }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: "#7c3aed", marginBottom: 8 }}>🏪 Salon Erişimleri</div>

      {loading ? (
        <div style={{ fontSize: 12, color: "#94a3b8" }}>Yükleniyor...</div>
      ) : accesses.length === 0 ? (
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>Ek salon erişimi yok.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {accesses.map(a => (
            <span key={a.salonId} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "3px 10px", borderRadius: 999,
              background: "#ede9fe", color: "#7c3aed",
              fontSize: 12, fontWeight: 600,
            }}>
              {a.salonName}
              <button
                onClick={() => revoke(a.salonId, a.salonName)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#7c3aed", fontSize: 14, lineHeight: 1, padding: 0 }}
                title="Erişimi kaldır"
              >×</button>
            </span>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select
            value={addSalon}
            onChange={e => setAddSalon(e.target.value)}
            style={{ flex: 1, padding: "5px 8px", borderRadius: 7, border: "1px solid #d1d5db", fontSize: 12, outline: "none" }}
          >
            <option value="">Salon seç…</option>
            {available.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button
            onClick={grant}
            disabled={!addSalon || saving}
            style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 12, cursor: addSalon && !saving ? "pointer" : "not-allowed", opacity: addSalon && !saving ? 1 : 0.6 }}
          >
            {saving ? "..." : "+ Ekle"}
          </button>
        </div>
      )}
      {available.length === 0 && !loading && (
        <div style={{ fontSize: 12, color: "#94a3b8" }}>Eklenebilecek başka salon yok.</div>
      )}
    </div>
  );
}

/* ─────────────────────────────── AI Assistant Training Panel ─── */

type KnowledgeItem = { id: string; question: string; answer: string };
type AiConfig = { systemPrompt: string; customKnowledge: KnowledgeItem[]; updatedAt: string };

function AIAssistantTab() {
  const { toast } = useToast();
  const [innerTab,  setInnerTab]  = useState<"prompt"|"knowledge"|"test">("prompt");
  const [config,    setConfig]    = useState<AiConfig | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [prompt,    setPrompt]    = useState("");
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [newQ,      setNewQ]      = useState("");
  const [newA,      setNewA]      = useState("");
  const [testMsgs,  setTestMsgs]  = useState<{ role: "user"|"assistant"; content: string }[]>([]);
  const [testInput, setTestInput] = useState("");
  const [testing,   setTesting]   = useState(false);
  const testBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch("/ai-config")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setConfig(data);
          setPrompt(data.systemPrompt);
          setKnowledge(data.customKnowledge ?? []);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    testBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [testMsgs, testing]);

  const savePrompt = async () => {
    setSaving(true);
    const res = await apiFetch("/ai-config", {
      method: "POST",
      body: JSON.stringify({ systemPrompt: prompt, customKnowledge: knowledge }),
    });
    setSaving(false);
    if (res.ok) { toast.success("Sistem promptu kaydedildi."); }
    else { toast.error("Kayıt hatası."); }
  };

  const saveKnowledge = async (updated: KnowledgeItem[]) => {
    const res = await apiFetch("/ai-config", {
      method: "POST",
      body: JSON.stringify({ systemPrompt: prompt, customKnowledge: updated }),
    });
    if (res.ok) { setKnowledge(updated); toast.success("Bilgi tabanı güncellendi."); }
    else { toast.error("Kayıt hatası."); }
  };

  const addKnowledge = async () => {
    if (!newQ.trim() || !newA.trim()) return;
    const item: KnowledgeItem = { id: Date.now().toString(), question: newQ.trim(), answer: newA.trim() };
    const updated = [...knowledge, item];
    await saveKnowledge(updated);
    setNewQ(""); setNewA("");
  };

  const removeKnowledge = (id: string) => {
    saveKnowledge(knowledge.filter(k => k.id !== id));
  };

  const resetToDefault = async () => {
    const res = await apiFetch("/ai-config", { method: "POST", body: JSON.stringify({ action: "reset" }) });
    if (res.ok) {
      const r2 = await apiFetch("/ai-config");
      if (r2.ok) { const d = await r2.json(); setPrompt(d.systemPrompt); setKnowledge(d.customKnowledge ?? []); }
      toast.success("Varsayılana sıfırlandı.");
    }
  };

  const sendTest = async (text?: string) => {
    const content = (text ?? testInput).trim();
    if (!content || testing) return;
    setTestInput("");
    const userMsg = { role: "user" as const, content };
    const next = [...testMsgs, userMsg];
    setTestMsgs(next);
    setTesting(true);
    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context: { page: "/test" } }),
      });
      const data = await res.json();
      setTestMsgs(prev => [...prev, { role: "assistant", content: data.reply ?? "Hata." }]);
    } catch {
      setTestMsgs(prev => [...prev, { role: "assistant", content: "Bağlantı hatası." }]);
    } finally { setTesting(false); }
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
    fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? "#7c3aed" : "#667085",
    borderBottom: active ? "2px solid #7c3aed" : "2px solid transparent",
    transition: "all 0.15s",
  });

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Yükleniyor...</div>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1e1b4b, #4c1d95)", borderRadius: 16, padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>xCut AI Asistan Eğitimi</div>
          <div style={{ fontSize: 12, color: "#a78bfa", marginTop: 4 }}>
            Asistanı buradan eğit ve özelleştir — değişiklikler anında devreye girer
          </div>
        </div>
        {config?.updatedAt && (
          <div style={{ fontSize: 11, color: "#6d28d9", background: "#ede9fe", borderRadius: 8, padding: "4px 12px", fontWeight: 600 }}>
            Son güncelleme: {new Date(config.updatedAt).toLocaleString("tr-TR")}
          </div>
        )}
      </div>

      {/* Inner tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #eaecf0", gap: 0 }}>
        <button style={tabStyle(innerTab === "prompt")}    onClick={() => setInnerTab("prompt")}>Sistem Promptu</button>
        <button style={tabStyle(innerTab === "knowledge")} onClick={() => setInnerTab("knowledge")}>
          Özel Bilgi Tabanı
          {knowledge.length > 0 && (
            <span style={{ marginLeft: 6, background: "#7c3aed", color: "#fff", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>
              {knowledge.length}
            </span>
          )}
        </button>
        <button style={tabStyle(innerTab === "test")}      onClick={() => setInnerTab("test")}>Test</button>
      </div>

      {/* Sistem Promptu */}
      {innerTab === "prompt" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#92400e" }}>
            Bu metin asistanın temel kişiliğini ve kurallarını belirler. Dikkatli düzenleyin.
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#344054", marginBottom: 8 }}>Sistem Promptu</div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={22}
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 12,
                border: "1.5px solid #e4e7ec", fontSize: 13, lineHeight: 1.7,
                fontFamily: "monospace", resize: "vertical", outline: "none",
                boxSizing: "border-box", color: "#1e293b",
              }}
              onFocus={e => (e.target.style.borderColor = "#7c3aed")}
              onBlur={e => (e.target.style.borderColor = "#e4e7ec")}
            />
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
              {prompt.length} karakter
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={savePrompt}
              disabled={saving}
              style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: saving ? "#a78bfa" : "#7c3aed", color: "#fff", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: 13 }}
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button
              onClick={resetToDefault}
              style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #fecaca", background: "#fef3f2", color: "#b42318", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
            >
              Varsayılana Sıfırla
            </button>
          </div>
        </div>
      )}

      {/* Özel Bilgi Tabanı */}
      {innerTab === "knowledge" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ background: "#eff8ff", border: "1px solid #bae6fd", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#0369a1" }}>
            Asistanın bilmediği şeyleri buraya ekle. Örneğin: "Bu uygulamayı kim yazdı?" sorusuna özel cevap tanımla.
          </div>

          {/* Yeni ekle */}
          <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 14, padding: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#6d28d9", marginBottom: 14 }}>Yeni Bilgi Ekle</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Soru / Tetikleyici Kelimeler</label>
                <input
                  value={newQ}
                  onChange={e => setNewQ(e.target.value)}
                  placeholder="ör: Bu uygulamayı kim yazdı?"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1.5px solid #e4e7ec", fontSize: 13, boxSizing: "border-box", outline: "none" }}
                  onFocus={e => (e.target.style.borderColor = "#7c3aed")}
                  onBlur={e => (e.target.style.borderColor = "#e4e7ec")}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Cevap</label>
                <textarea
                  value={newA}
                  onChange={e => setNewA(e.target.value)}
                  placeholder="ör: xCut, xShield yazılım ekibi tarafından geliştirildi."
                  rows={3}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1.5px solid #e4e7ec", fontSize: 13, resize: "vertical", boxSizing: "border-box", outline: "none" }}
                  onFocus={e => (e.target.style.borderColor = "#7c3aed")}
                  onBlur={e => (e.target.style.borderColor = "#e4e7ec")}
                />
              </div>
              <button
                onClick={addKnowledge}
                disabled={!newQ.trim() || !newA.trim()}
                style={{
                  padding: "9px 18px", borderRadius: 10, border: "none",
                  background: newQ.trim() && newA.trim() ? "#7c3aed" : "#e2e8f0",
                  color: newQ.trim() && newA.trim() ? "#fff" : "#94a3b8",
                  fontWeight: 700, cursor: newQ.trim() && newA.trim() ? "pointer" : "not-allowed",
                  fontSize: 13, width: "fit-content",
                }}
              >
                + Ekle
              </button>
            </div>
          </div>

          {/* Liste */}
          {knowledge.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🧠</div>
              <div style={{ fontSize: 13 }}>Henüz özel bilgi eklenmedi.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {knowledge.map((k, i) => (
                <div key={k.id} style={{ background: "#fff", border: "1px solid #eaecf0", borderRadius: 12, padding: "14px 16px", borderLeft: "4px solid #7c3aed" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        #{i + 1} · Soru
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", marginBottom: 8 }}>{k.question}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Cevap</div>
                      <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{k.answer}</div>
                    </div>
                    <button
                      onClick={() => removeKnowledge(k.id)}
                      style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: "#fef3f2", color: "#b42318", fontWeight: 700, cursor: "pointer", fontSize: 11, flexShrink: 0 }}
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Test */}
      {innerTab === "test" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#059669" }}>
            Kaydettiğin sistem promptu ve bilgi tabanıyla canlı test yap.
          </div>

          <div style={{ border: "1px solid #eaecf0", borderRadius: 16, overflow: "hidden", background: "#fff" }}>
            {/* Mesajlar */}
            <div style={{ minHeight: 300, maxHeight: 440, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {testMsgs.length === 0 && (
                <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", marginTop: 60 }}>
                  Buraya bir şey yaz ve asistanın nasıl cevap verdiğini gör.
                </div>
              )}
              {testMsgs.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "80%", padding: "10px 14px",
                    borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    background: m.role === "user" ? "linear-gradient(135deg, #7c3aed, #6d28d9)" : "#f8fafc",
                    color: m.role === "user" ? "#fff" : "#1e293b",
                    fontSize: 13, lineHeight: 1.6,
                    border: m.role === "assistant" ? "1px solid #f1f5f9" : "none",
                  }}>
                    {m.content}
                  </div>
                </div>
              ))}
              {testing && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: "14px 14px 14px 4px", border: "1px solid #f1f5f9", display: "flex", gap: 4 }}>
                    {[0,1,2].map(i => (
                      <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#a78bfa", display: "inline-block", animation: "xai-dot 1.2s infinite", animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={testBottomRef} />
            </div>

            {/* Input */}
            <div style={{ padding: "12px 14px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8, alignItems: "flex-end", background: "#fafafa" }}>
              <input
                value={testInput}
                onChange={e => setTestInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sendTest(); } }}
                placeholder="Test mesajı yaz… (Enter gönder)"
                style={{ flex: 1, padding: "9px 14px", borderRadius: 10, border: "1.5px solid #e4e7ec", fontSize: 13, outline: "none" }}
                onFocus={e => (e.target.style.borderColor = "#7c3aed")}
                onBlur={e => (e.target.style.borderColor = "#e4e7ec")}
              />
              <button
                onClick={() => sendTest()}
                disabled={!testInput.trim() || testing}
                style={{
                  padding: "9px 18px", borderRadius: 10, border: "none",
                  background: testInput.trim() && !testing ? "#7c3aed" : "#e2e8f0",
                  color: testInput.trim() && !testing ? "#fff" : "#94a3b8",
                  fontWeight: 700, cursor: testInput.trim() && !testing ? "pointer" : "not-allowed",
                  fontSize: 13, flexShrink: 0,
                }}
              >
                Gönder
              </button>
              {testMsgs.length > 0 && (
                <button
                  onClick={() => setTestMsgs([])}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #e4e7ec", background: "#fff", color: "#64748b", fontWeight: 600, cursor: "pointer", fontSize: 13, flexShrink: 0 }}
                >
                  Temizle
                </button>
              )}
            </div>
          </div>

          {/* Hızlı test önerileri */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {["Bu uygulamayı kim yazdı?", "Nasıl randevu alırım?", "Fiyatlandırma nasıl?", "Google Takvim nasıl bağlanır?"].map(q => (
              <button
                key={q}
                onClick={() => sendTest(q)}
                style={{ padding: "6px 12px", borderRadius: 20, border: "1px solid #e9d5ff", background: "#faf5ff", color: "#7c3aed", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────── SMTP Settings Tab ─── */

type SmtpForm = {
  host: string; port: string; secure: boolean;
  user: string; password: string;
  fromName: string; fromEmail: string;
};

function SmtpSettingsTab() {
  const { toast } = useToast();
  const [form,       setForm]       = useState<SmtpForm>({
    host: "", port: "587", secure: false,
    user: "noreply-xcut@xshield.com.tr", password: "",
    fromName: "xCut", fromEmail: "noreply-xcut@xshield.com.tr",
  });
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [showPass,   setShowPass]   = useState(false);
  const [testTo,     setTestTo]     = useState("");
  const [testing,    setTesting]    = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    apiFetch("/smtp-config")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setForm({
            host:      d.host      ?? "",
            port:      String(d.port ?? 587),
            secure:    Boolean(d.secure),
            user:      d.user      ?? "noreply-xcut@xshield.com.tr",
            password:  d.password  ?? "",
            fromName:  d.fromName  ?? "xCut",
            fromEmail: d.fromEmail ?? "noreply-xcut@xshield.com.tr",
          });
          setConfigured(Boolean(d.host && d.user && d.password));
        }
        setLoading(false);
      });
  }, []);

  const f = (k: keyof SmtpForm, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.host.trim()) { toast.error("SMTP sunucusu zorunlu."); return; }
    setSaving(true);
    const res = await apiFetch("/smtp-config", {
      method: "POST",
      body: JSON.stringify({ ...form, port: Number(form.port) || 587 }),
    });
    setSaving(false);
    if (res.ok) {
      setConfigured(Boolean(form.host && form.user && form.password && form.password !== "••••••••"));
      toast.success("SMTP ayarları kaydedildi.");
    } else {
      toast.error("Kayıt hatası.");
    }
  };

  const sendTest = async () => {
    if (!testTo.trim()) { toast.error("Test e-posta adresi girin."); return; }
    setTesting(true);
    const res = await apiFetch("/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: testTo.trim(),
        subject: "xCut SMTP Test Maili",
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <h2 style="color:#7c3aed;margin-bottom:8px;">xCut SMTP Test</h2>
          <p style="color:#374151;">Bu mail SMTP yapılandırmasının doğru çalıştığını doğrulamak için gönderilmiştir.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
          <p style="font-size:12px;color:#9ca3af;">xCut Salon Yönetim Sistemi</p>
        </div>`,
      }),
    });
    setTesting(false);
    if (res.ok) {
      toast.success(`Test maili ${testTo} adresine gönderildi.`);
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Mail gönderilemedi.");
    }
  };

  const smtpInpStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: "1px solid #d0d5dd", fontSize: 13, boxSizing: "border-box",
    background: "var(--surface, #fff)", color: "var(--text, #101828)",
    outline: "none", transition: "border-color 0.15s",
  };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Yükleniyor...</div>;

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 680 }}>
      {/* Durum */}
      <div style={{
        padding: "14px 18px", borderRadius: 12,
        background: configured ? "#f0fdf4" : "#fffbeb",
        border: `1px solid ${configured ? "#bbf7d0" : "#fde68a"}`,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: configured ? "#22c55e" : "#f59e0b", flexShrink: 0 }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: configured ? "#15803d" : "#92400e" }}>
          {configured ? "SMTP yapılandırıldı — sistem mail gönderebilir" : "SMTP henüz yapılandırılmadı"}
        </div>
      </div>

      {/* Sunucu */}
      <div style={{ background: "var(--surface, #fff)", borderRadius: 16, border: "1px solid #eaecf0", padding: "24px 28px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text, #0f172a)", marginBottom: 20 }}>Sunucu Ayarları</div>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>SMTP Sunucusu *</label>
            <input value={form.host} onChange={e => f("host", e.target.value.trim())} placeholder="mail.xshield.com.tr" style={smtpInpStyle}
              onFocus={e => (e.target.style.borderColor = "#7c3aed")} onBlur={e => (e.target.style.borderColor = "#d0d5dd")} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Port</label>
              <select value={form.port} onChange={e => { f("port", e.target.value); f("secure", e.target.value === "465"); }}
                style={{ ...smtpInpStyle, cursor: "pointer" }}>
                <option value="587">587 — STARTTLS (önerilen)</option>
                <option value="465">465 — SSL</option>
                <option value="25">25 — Plain</option>
                <option value="2525">2525 — Alternatif</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#344054" }}>
                <input type="checkbox" checked={form.secure} onChange={e => f("secure", e.target.checked)} style={{ width: 14, height: 14 }} />
                SSL/TLS (secure)
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Auth */}
      <div style={{ background: "var(--surface, #fff)", borderRadius: 16, border: "1px solid #eaecf0", padding: "24px 28px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text, #0f172a)", marginBottom: 20 }}>Kimlik Doğrulama</div>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Kullanıcı Adı / E-posta</label>
            <input value={form.user} onChange={e => f("user", e.target.value.trim())} placeholder="noreply-xcut@xshield.com.tr"
              style={smtpInpStyle} onFocus={e => (e.target.style.borderColor = "#7c3aed")} onBlur={e => (e.target.style.borderColor = "#d0d5dd")} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Şifre</label>
            <div style={{ position: "relative" }}>
              <input type={showPass ? "text" : "password"} value={form.password} onChange={e => f("password", e.target.value)}
                placeholder="••••••••" style={{ ...smtpInpStyle, paddingRight: 60 }}
                onFocus={e => (e.target.style.borderColor = "#7c3aed")} onBlur={e => (e.target.style.borderColor = "#d0d5dd")} />
              <button type="button" onClick={() => setShowPass(v => !v)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>
                {showPass ? "Gizle" : "Göster"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* From */}
      <div style={{ background: "var(--surface, #fff)", borderRadius: 16, border: "1px solid #eaecf0", padding: "24px 28px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text, #0f172a)", marginBottom: 20 }}>Gönderen Bilgisi</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Gönderen Adı</label>
            <input value={form.fromName} onChange={e => f("fromName", e.target.value)} placeholder="xCut"
              style={smtpInpStyle} onFocus={e => (e.target.style.borderColor = "#7c3aed")} onBlur={e => (e.target.style.borderColor = "#d0d5dd")} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Gönderen E-posta</label>
            <input value={form.fromEmail} onChange={e => f("fromEmail", e.target.value.trim())} placeholder="noreply-xcut@xshield.com.tr"
              style={smtpInpStyle} onFocus={e => (e.target.style.borderColor = "#7c3aed")} onBlur={e => (e.target.style.borderColor = "#d0d5dd")} />
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        style={{ padding: "11px 28px", borderRadius: 10, border: "none", background: saving ? "#a78bfa" : "#7c3aed", color: "#fff", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: 14, width: "fit-content" }}>
        {saving ? "Kaydediliyor..." : "💾 Kaydet"}
      </button>

      {/* Test */}
      <div style={{ background: "var(--surface, #fff)", borderRadius: 16, border: "1px solid #eaecf0", padding: "24px 28px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text, #0f172a)", marginBottom: 6 }}>Test Maili Gönder</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Ayarların doğru çalıştığını test et.</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="test@ornek.com"
            style={{ ...smtpInpStyle, flex: 1 }} onFocus={e => (e.target.style.borderColor = "#7c3aed")} onBlur={e => (e.target.style.borderColor = "#d0d5dd")} />
          <button onClick={sendTest} disabled={testing || !testTo.trim()}
            style={{
              padding: "9px 20px", borderRadius: 10, border: "none",
              background: testTo.trim() && !testing ? "#1d4ed8" : "#e2e8f0",
              color: testTo.trim() && !testing ? "#fff" : "#94a3b8",
              fontWeight: 700, cursor: testTo.trim() && !testing ? "pointer" : "not-allowed",
              fontSize: 13, flexShrink: 0,
            }}>
            {testing ? "Gönderiliyor..." : "Test Et"}
          </button>
        </div>
      </div>
    </div>
  );
}
