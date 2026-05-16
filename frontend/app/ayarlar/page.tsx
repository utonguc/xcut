"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

type Role           = { id: string; name: string; displayName: string; description: string; color: string; modules: string[]; isSelfOnly: boolean };
type UserItem       = { id: string; fullName: string; userName: string; email: string; isActive: boolean; roleId?: string; roleName?: string };
type OrgSettings    = { id: string; companyName: string; applicationTitle: string; logoUrl?: string; primaryColor: string; mfaEnabled?: boolean };
type BankAccount    = { id: string; bankName: string; accountName: string; iban?: string; isActive: boolean };
type PermGroup      = { id: string; name: string; description?: string; allowedModules: string[]; isSelfOnly: boolean; isBuiltIn: boolean; userCount: number; users: { id: string; fullName: string; email: string; role?: string }[] };

const ALL_MODULES = [
  { key: "appointments", label: "📅 Randevular + Takvim" },
  { key: "customers",    label: "👥 Müşteriler" },
  { key: "staff",        label: "✂️ Stilistler" },
  { key: "services",     label: "✨ Hizmetler" },
  { key: "stock",        label: "📦 Stok" },
  { key: "tasks",        label: "✅ Görevler" },
  { key: "kasa",         label: "🧾 Kasa" },
  { key: "finance",      label: "💰 Finans" },
  { key: "reports",      label: "📊 Raporlar" },
  { key: "whatsapp",     label: "💬 WhatsApp" },
  { key: "audit",        label: "🔍 Denetim" },
  { key: "website",      label: "🌐 Web Sitesi" },
];

const field = (label: string, children: React.ReactNode) => (
  <div key={label}>
    <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 6 }}>{label}</label>
    {children}
  </div>
);

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: "1px solid #e4e7ec", fontSize: 13, boxSizing: "border-box",
};

const ROLE_COLOR: Record<string, string> = {
  SuperAdmin: "#7c3aed", SalonYonetici: "#1d4ed8",
  Stilist: "#065f46", Kasiyer: "#92400e",
  Resepsiyon: "#0e7490", Calfa: "#6b21a8",
  Kiosk: "#0891b2", Muhasebe: "#0f766e", CRM: "#be185d",
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [tab,        setTab]        = useState<"org" | "users" | "banka" | "yetki" | "security" | "entegrasyon" | "bildirimler">("org");
  const [isSelfOnly, setIsSelfOnly] = useState(false);

  useEffect(() => {
    apiFetch("/Auth/me").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.isSelfOnly) { setIsSelfOnly(true); setTab("security"); }
    });
    // Handle Google OAuth callback redirect
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    if (gcal === "connected") {
      toast.success("Salon Google Calendar başarıyla bağlandı!");
      setTab("entegrasyon");
      window.history.replaceState({}, "", "/ayarlar");
    } else if (gcal === "self_connected") {
      toast.success("Kişisel Google Takviminiz başarıyla bağlandı!");
      setTab("entegrasyon");
      window.history.replaceState({}, "", "/ayarlar");
    } else if (gcal === "error") {
      toast.error("Google Calendar bağlantısı başarısız oldu.");
      setTab("entegrasyon");
      window.history.replaceState({}, "", "/ayarlar");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isSelfOnly) {
    return (
      <AppShell title="Ayarlar" description="Hesap güvenliği">
        <SecurityTab />
      </AppShell>
    );
  }

  return (
    <AppShell title="Ayarlar" description="Kurum, kullanıcı ve güvenlik yönetimi">
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#f1f5f9", borderRadius: 12, padding: 4, width: "fit-content", flexWrap: "wrap" }}>
        {([
          ["org",         "🏢 Kurum"],
          ["users",       "👥 Kullanıcılar"],
          ["banka",       "🏦 Banka Hesapları"],
          ["yetki",       "🔐 Yetki Grupları"],
          ["bildirimler",  "🔔 Bildirimler"],
          ["entegrasyon",  "🔗 Entegrasyonlar"],
          ["security",     "🔒 Güvenlik"],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
            fontWeight: 600, fontSize: 13,
            background: tab === t ? "#fff" : "transparent",
            color: tab === t ? "#0f172a" : "#64748b",
            boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,.08)" : "none",
          }}>{label}</button>
        ))}
      </div>

      {tab === "org"         && <OrgTab />}
      {tab === "users"       && <UsersTab />}
      {tab === "banka"       && <BankaTab />}
      {tab === "yetki"       && <YetkiTab />}
      {tab === "bildirimler"  && <BildirimlerTab />}
      {tab === "entegrasyon"  && <EntegrasyonlarTab />}
      {tab === "security"     && <SecurityTab />}
    </AppShell>
  );
}

function OrgTab() {
  const [org, setOrg]       = useState<OrgSettings>({ id: "", companyName: "", applicationTitle: "", logoUrl: "", primaryColor: "#7c3aed" });
  const [msg, setMsg]       = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/Settings/organization").then(r => r.ok ? r.json() : null).then(d => { if (d) setOrg(d); });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const r = await apiFetch("/Settings/organization", {
      method: "PUT",
      body: JSON.stringify({ companyName: org.companyName, applicationTitle: org.applicationTitle, logoUrl: org.logoUrl, primaryColor: org.primaryColor, mfaEnabled: org.mfaEnabled ?? false }),
    });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    setMsg({ text: d.message ?? (r.ok ? "Kaydedildi." : "Hata."), ok: r.ok });
  };

  const uploadLogo = async (file: File) => {
    const fd = new FormData(); fd.append("file", file);
    const r = await apiFetch("/Settings/organization/logo", { method: "POST", body: fd });
    if (r.ok) { const d = await r.json(); setOrg(p => ({ ...p, logoUrl: d.logoUrl })); setMsg({ text: "Logo yüklendi.", ok: true }); }
    else setMsg({ text: "Logo yüklenemedi.", ok: false });
  };

  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 20 }}>

      {org.logoUrl && (
        <div style={{ background: "var(--surface, #fff)", borderRadius: 16, border: "1px solid #eaecf0", padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={org.logoUrl} alt="logo" style={{ height: 48, maxWidth: 160, objectFit: "contain" }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{org.companyName || org.applicationTitle}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Mevcut logo</div>
          </div>
        </div>
      )}

      <div style={{ background: "var(--surface, #fff)", borderRadius: 16, border: "1px solid #eaecf0", padding: 24 }}>
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {field("Salon Adı", <input value={org.companyName} onChange={e => setOrg(p => ({ ...p, companyName: e.target.value }))} style={inputStyle} />)}
          {field("Uygulama Başlığı", <input value={org.applicationTitle} onChange={e => setOrg(p => ({ ...p, applicationTitle: e.target.value }))} style={inputStyle} />)}

          {field("Logo", (
            <div style={{ display: "flex", gap: 10 }}>
              <input value={org.logoUrl ?? ""} onChange={e => setOrg(p => ({ ...p, logoUrl: e.target.value }))} placeholder="Logo URL (opsiyonel)" style={{ ...inputStyle, flex: 1 }} />
              <label style={{
                padding: "10px 16px", borderRadius: 10, border: "1px dashed #e4e7ec",
                background: "var(--surface-2, #f8fafc)", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#64748b", whiteSpace: "nowrap",
              }}>
                📁 Yükle
                <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
              </label>
            </div>
          ))}

          {field("Ana Renk", (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <input value={org.primaryColor} onChange={e => setOrg(p => ({ ...p, primaryColor: e.target.value }))}
                placeholder="#7c3aed" style={{ ...inputStyle, flex: 1 }} />
              <input type="color" value={org.primaryColor} onChange={e => setOrg(p => ({ ...p, primaryColor: e.target.value }))}
                style={{ width: 44, height: 44, border: "1px solid #e4e7ec", borderRadius: 10, padding: 2, cursor: "pointer", background: "none" }} />
              <div style={{ width: 44, height: 44, borderRadius: 10, background: org.primaryColor, border: "1px solid #e4e7ec", flexShrink: 0 }} />
            </div>
          ))}

          {/* MFA Toggle */}
          <div style={{ padding: "16px", borderRadius: 12, border: "1px solid var(--border,#e4e7ec)", background: "var(--surface-2,#f8fafc)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text,#101828)", marginBottom: 4 }}>🔐 İki Adımlı Doğrulama (MFA)</div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                  Açık olduğunda kullanıcılar şifre girişinden sonra e-posta adreslerine gelen 6 haneli kodu girerek giriş yapar.
                </div>
              </div>
              <label style={{ position: "relative", display: "inline-block", width: 48, height: 26, flexShrink: 0, cursor: "pointer" }}>
                <input type="checkbox" checked={org.mfaEnabled ?? false} onChange={e => setOrg(p => ({ ...p, mfaEnabled: e.target.checked }))}
                  style={{ opacity: 0, width: 0, height: 0 }} />
                <span style={{
                  position: "absolute", inset: 0, borderRadius: 13, transition: ".2s",
                  background: org.mfaEnabled ? "#7c3aed" : "#d1d5db",
                }}>
                  <span style={{
                    position: "absolute", top: 3, left: org.mfaEnabled ? 25 : 3, width: 20, height: 20,
                    borderRadius: "50%", background: "#fff", transition: ".2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                  }} />
                </span>
              </label>
            </div>
          </div>

          {msg && (
            <div style={{
              padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: msg.ok ? "#f0fdf4" : "#fef3f2",
              color: msg.ok ? "#166534" : "#b42318",
              border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`,
            }}>{msg.text}</div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" disabled={saving} style={{
              padding: "10px 24px", borderRadius: 10, border: "none",
              background: saving ? "#a78bfa" : "#7c3aed",
              color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer",
            }}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsersTab() {
  const [roles, setRoles]   = useState<Role[]>([]);
  const [users, setUsers]   = useState<UserItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg]       = useState<{ text: string; ok: boolean } | null>(null);
  const [editPw,  setEditPw]  = useState<{ userId: string; pw: string } | null>(null);

  const [fullName,  setFullName]  = useState("");
  const [userName,  setUserName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [roleId,    setRoleId]    = useState("");
  const [creating,  setCreating]  = useState(false);

  const selRole = roles.find(r => r.id === roleId);

  const load = async () => {
    const [rRes, uRes] = await Promise.all([apiFetch("/Users/roles"), apiFetch("/Users")]);
    if (rRes.ok) setRoles(await rRes.json());
    if (uRes.ok) setUsers(await uRes.json());
  };

  useEffect(() => { load(); }, []);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const r = await apiFetch("/Users", { method: "POST", body: JSON.stringify({ fullName, userName: userName || undefined, email, password, roleId: roleId || null }) });
    const d = await r.json().catch(() => ({}));
    setCreating(false);
    setMsg({ text: (d as {message?: string}).message ?? (r.ok ? "Kullanıcı oluşturuldu." : "Hata."), ok: r.ok });
    if (r.ok) { setFullName(""); setUserName(""); setEmail(""); setPassword(""); setRoleId(""); setShowForm(false); load(); }
  };

  const updateUser = async (u: UserItem, newRoleId: string, newActive: boolean) => {
    await apiFetch(`/Users/${u.id}`, { method: "PUT", body: JSON.stringify({ fullName: u.fullName, email: u.email, roleId: newRoleId || null, isActive: newActive }) });
    load();
  };

  const resetPw = async () => {
    if (!editPw) return;
    const r = await apiFetch(`/Users/${editPw.userId}/password`, { method: "PUT", body: JSON.stringify({ newPassword: editPw.pw }) });
    const d = await r.json().catch(() => ({}));
    setMsg({ text: (d as {message?: string}).message ?? (r.ok ? "Şifre güncellendi." : "Hata."), ok: r.ok });
    setEditPw(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#64748b" }}>{users.length} kullanıcı</div>
        <button onClick={() => setShowForm(v => !v)} style={{
          padding: "8px 18px", borderRadius: 10, border: "none",
          background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
        }}>
          {showForm ? "✕ Kapat" : "+ Yeni Kullanıcı"}
        </button>
      </div>

      {msg && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 16,
          background: msg.ok ? "#f0fdf4" : "#fef3f2",
          color: msg.ok ? "#166534" : "#b42318",
          border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`,
        }}>{msg.text}</div>
      )}

      {showForm && (
        <form onSubmit={createUser} style={{ background: "var(--surface, #fff)", borderRadius: 16, border: "1px solid #eaecf0", padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Yeni Kullanıcı</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Ad Soyad *</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Kullanıcı Adı <span style={{ color: "#94a3b8" }}>(boş bırakılırsa otomatik)</span></label>
              <input value={userName} onChange={e => setUserName(e.target.value)} style={inputStyle} placeholder="orn. ahmet42" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>E-posta *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Şifre *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Kullanıcı Tipi *</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                {roles.map(r => (
                  <label key={r.id} style={{
                    display: "flex", flexDirection: "column", gap: 2, padding: "10px 12px", borderRadius: 10,
                    border: `2px solid ${roleId === r.id ? r.color : "#e4e7ec"}`,
                    background: roleId === r.id ? `${r.color}10` : "var(--surface,#fff)",
                    cursor: "pointer",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="radio" name="roleId" value={r.id} checked={roleId === r.id} onChange={() => setRoleId(r.id)} style={{ accentColor: r.color }} />
                      <span style={{ fontWeight: 700, fontSize: 13, color: roleId === r.id ? r.color : "var(--text,#101828)" }}>{r.displayName}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "#64748b", paddingLeft: 20 }}>{r.description}</span>
                  </label>
                ))}
              </div>
              {selRole?.name === "Stilist" && (
                <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 12, color: "#166534" }}>
                  ✓ Bu kullanıcı Stilistler listesinde otomatik görünecek. Ücret ve program ayarlarını Stilistler sayfasından yapabilirsiniz.
                </div>
              )}
            </div>
          </div>
          <button type="submit" disabled={creating || !roleId} style={{
            padding: "10px 24px", borderRadius: 10, border: "none",
            background: creating || !roleId ? "#a78bfa" : "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
          }}>{creating ? "Oluşturuluyor..." : "Kullanıcı Oluştur"}</button>
        </form>
      )}

      {/* Password reset modal */}
      {editPw && (
        <>
          <div onClick={() => setEditPw(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 400 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 401, background: "#fff", borderRadius: 16, padding: 24, width: "min(360px,90vw)", boxShadow: "0 16px 48px rgba(0,0,0,0.2)" }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Şifre Sıfırla</div>
            <input type="password" value={editPw.pw} onChange={e => setEditPw(p => p ? { ...p, pw: e.target.value } : null)} placeholder="Yeni şifre (min 6 karakter)" style={{ ...inputStyle, marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setEditPw(null)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #e4e7ec", background: "#fff", cursor: "pointer" }}>İptal</button>
              <button onClick={resetPw} style={{ flex: 2, padding: 10, borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Kaydet</button>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {users.map(u => {
          const rc = ROLE_COLOR[u.roleName ?? ""] ?? "#374151";
          const role = roles.find(r => r.id === u.roleId);
          return (
            <div key={u.id} style={{ background: "var(--surface, #fff)", borderRadius: 14, border: "1px solid #eaecf0", padding: "14px 20px",
              display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: rc, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                {u.fullName.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{u.fullName}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{u.userName} · {u.email}</div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 999,
                background: `${rc}20`, color: rc, border: `1px solid ${rc}40`, whiteSpace: "nowrap",
              }}>{role?.displayName ?? u.roleName ?? "—"}</span>
              <select value={u.roleId ?? ""} onChange={e => updateUser(u, e.target.value, u.isActive)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e4e7ec", fontSize: 12, maxWidth: 180 }}>
                <option value="">— Rol yok</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.displayName}</option>)}
              </select>
              <button onClick={() => setEditPw({ userId: u.id, pw: "" })} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e4e7ec", background: "#fff", cursor: "pointer", fontSize: 12 }}>
                🔑 Şifre
              </button>
              <button onClick={() => updateUser(u, u.roleId ?? "", !u.isActive)} style={{
                padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12,
                background: u.isActive ? "#dcfce7" : "#fef3f2",
                color: u.isActive ? "#166534" : "#b42318",
              }}>
                {u.isActive ? "Aktif" : "Pasif"}
              </button>
            </div>
          );
        })}
        {users.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13, padding: 20 }}>Kullanıcı bulunamadı.</div>}
      </div>
    </div>
  );
}

function BankaTab() {
  const { toast, confirm } = useToast();
  const [banks,    setBanks]    = useState<BankAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<BankAccount | null>(null);
  const [bankName, setBankName] = useState("");
  const [accName,  setAccName]  = useState("");
  const [iban,     setIban]     = useState("");
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState<{ text: string; ok: boolean } | null>(null);

  const load = async () => {
    const r = await apiFetch("/BankAccount");
    if (r.ok) setBanks(await r.json());
  };

  useEffect(() => { load(); }, []);

  const openForm = (b?: BankAccount) => {
    setEditing(b ?? null);
    setBankName(b?.bankName ?? "");
    setAccName(b?.accountName ?? "");
    setIban(b?.iban ?? "");
    setShowForm(true);
    setMsg(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const body = { bankName, accountName: accName, iban: iban || null };
    const r = editing
      ? await apiFetch(`/BankAccount/${editing.id}`, { method: "PUT", body: JSON.stringify({ ...body, isActive: editing.isActive }) })
      : await apiFetch("/BankAccount", { method: "POST", body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) { setShowForm(false); setEditing(null); load(); }
    else setMsg({ text: "Kaydedilemedi.", ok: false });
  };

  const toggleActive = async (b: BankAccount) => {
    await apiFetch(`/BankAccount/${b.id}`, { method: "PUT", body: JSON.stringify({ bankName: b.bankName, accountName: b.accountName, iban: b.iban, isActive: !b.isActive }) });
    load();
  };

  const del = async (id: string) => {
    const ok = await confirm({ message: "Bu hesabı silmek istediğinizden emin misiniz?", danger: true });
    if (!ok) return;
    await apiFetch(`/BankAccount/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#64748b" }}>{banks.length} hesap tanımlı</div>
        <button onClick={() => openForm()} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Hesap Ekle
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ background: "var(--surface, #fff)", borderRadius: 16, border: "1px solid #eaecf0", padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Banka Adı *</label>
            <input value={bankName} onChange={e => setBankName(e.target.value)} required style={inputStyle} placeholder="Ziraat, İş Bankası..." />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Hesap Sahibi *</label>
            <input value={accName} onChange={e => setAccName(e.target.value)} required style={inputStyle} placeholder="Hesap sahibi adı" />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>IBAN</label>
            <input value={iban} onChange={e => setIban(e.target.value)} style={inputStyle} placeholder="TR00 0000 0000 0000 0000 0000 00" />
          </div>
          {msg && (
            <div style={{ gridColumn: "span 2", padding: "8px 12px", borderRadius: 8, background: "#fef3f2", color: "#b42318", fontSize: 12, fontWeight: 600 }}>{msg.text}</div>
          )}
          <div style={{ gridColumn: "span 2", display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} style={{ padding: "8px 18px", borderRadius: 10, border: "1px solid #e4e7ec", background: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>İptal</button>
            <button type="submit" disabled={saving} style={{ padding: "8px 24px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {saving ? "Kaydediliyor..." : editing ? "Güncelle" : "Ekle"}
            </button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {banks.map(b => (
          <div key={b.id} style={{ background: "var(--surface, #fff)", borderRadius: 14, border: "1px solid #eaecf0", padding: "14px 20px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🏦</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{b.bankName}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{b.accountName}</div>
              {b.iban && <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{b.iban}</div>}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 999, background: b.isActive ? "#dcfce7" : "#f1f5f9", color: b.isActive ? "#166534" : "#94a3b8" }}>
              {b.isActive ? "Aktif" : "Pasif"}
            </span>
            <button onClick={() => openForm(b)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e4e7ec", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Düzenle</button>
            <button onClick={() => toggleActive(b)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", background: b.isActive ? "#fef3f2" : "#f0fdf4", color: b.isActive ? "#b42318" : "#166534" }}>
              {b.isActive ? "Pasife Al" : "Aktife Al"}
            </button>
            <button onClick={() => del(b.id)} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "none", color: "#dc2626", fontSize: 14, cursor: "pointer" }}>×</button>
          </div>
        ))}
        {banks.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13, padding: 20 }}>Henüz banka hesabı tanımlanmamış.</div>}
      </div>
    </div>
  );
}

function SecurityTab() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving]       = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { setMsg({ text: "Yeni şifreler eşleşmiyor.", ok: false }); return; }
    if (newPw.length < 6)    { setMsg({ text: "Şifre en az 6 karakter olmalı.", ok: false }); return; }
    setSaving(true);
    const r = await apiFetch("/Auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }) });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    setMsg({ text: d.message ?? (r.ok ? "Şifre değiştirildi." : "Hata."), ok: r.ok });
    if (r.ok) { setCurrentPw(""); setNewPw(""); setConfirmPw(""); }
  };

  return (
    <div style={{ maxWidth: 460 }}>
      <div style={{ background: "var(--surface, #fff)", borderRadius: 16, border: "1px solid #eaecf0", padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text, #0f172a)", marginBottom: 20 }}>Şifre Değiştir</div>
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { label: "Mevcut Şifre", val: currentPw, setter: setCurrentPw },
            { label: "Yeni Şifre",   val: newPw,     setter: setNewPw },
            { label: "Yeni Şifre (Tekrar)", val: confirmPw, setter: setConfirmPw },
          ].map(({ label, val, setter }) => (
            <div key={label}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 6 }}>{label}</label>
              <input type={showPw ? "text" : "password"} value={val} onChange={e => setter(e.target.value)} required style={inputStyle} />
            </div>
          ))}

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748b", cursor: "pointer" }}>
            <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} />
            Şifreleri göster
          </label>

          {msg && (
            <div style={{
              padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: msg.ok ? "#f0fdf4" : "#fef3f2",
              color: msg.ok ? "#166534" : "#b42318",
              border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`,
            }}>{msg.text}</div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" disabled={saving} style={{
              padding: "10px 24px", borderRadius: 10, border: "none",
              background: saving ? "#a78bfa" : "#0f172a", color: "#fff",
              fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer",
            }}>
              {saving ? "Değiştiriliyor..." : "Şifreyi Değiştir"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   YETKİ GRUPLARI TAB
   ════════════════════════════════════════════════════════════════════ */
function YetkiTab() {
  const { toast, confirm } = useToast();
  const [groups,      setGroups]      = useState<PermGroup[]>([]);
  const [users,       setUsers]       = useState<UserItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [editGroup,   setEditGroup]   = useState<PermGroup | null>(null);
  const [showForm,    setShowForm]    = useState(false);
  const [formName,    setFormName]    = useState("");
  const [formDesc,    setFormDesc]    = useState("");
  const [formModules, setFormModules] = useState<string[]>([]);
  const [formSelfOnly,setFormSelfOnly]= useState(false);
  const [saving,      setSaving]      = useState(false);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [addUserId,   setAddUserId]   = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const [gr, ur] = await Promise.all([apiFetch("/PermissionGroup"), apiFetch("/Settings/users")]);
    if (gr.ok) setGroups(await gr.json());
    if (ur.ok) { const d = await ur.json(); setUsers(d.items ?? d); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditGroup(null); setFormName(""); setFormDesc(""); setFormModules([]); setFormSelfOnly(false); setShowForm(true); };
  const openEdit   = (g: PermGroup) => { setEditGroup(g); setFormName(g.name); setFormDesc(g.description ?? ""); setFormModules([...g.allowedModules]); setFormSelfOnly(g.isSelfOnly); setShowForm(true); };
  const toggleMod  = (key: string) => setFormModules(prev => prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    const body = { name: formName.trim(), description: formDesc || null, allowedModules: formModules, isSelfOnly: formSelfOnly };
    const r = editGroup
      ? await apiFetch(`/PermissionGroup/${editGroup.id}`, { method: "PUT",  body: JSON.stringify(body) })
      : await apiFetch("/PermissionGroup",                  { method: "POST", body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) { setShowForm(false); load(); } else toast.error("Kaydedilemedi.");
  };

  const del = async (g: PermGroup) => {
    const ok = await confirm({ message: `"${g.name}" grubunu silmek istiyor musunuz?`, danger: true });
    if (!ok) return;
    await apiFetch(`/PermissionGroup/${g.id}`, { method: "DELETE" });
    load();
  };

  const assignUser = async (groupId: string) => {
    const uid = addUserId[groupId];
    if (!uid) return;
    const r = await apiFetch(`/PermissionGroup/${groupId}/users`, { method: "POST", body: JSON.stringify({ userId: uid }) });
    if (r.ok) { setAddUserId(prev => ({ ...prev, [groupId]: "" })); load(); } else toast.error("Eklenemedi.");
  };

  const removeUser = async (groupId: string, userId: string) => {
    await apiFetch(`/PermissionGroup/${groupId}/users/${userId}`, { method: "DELETE" });
    load();
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>;

  return (
    <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "#64748b" }}>Yetki grupları oluşturun, hangi menülerin görüneceğini ve kullanıcı atamalarını yönetin.</div>
        <button onClick={openCreate} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Yeni Grup</button>
      </div>

      {groups.length === 0 ? (
        <div style={{ background: "#f8fafc", borderRadius: 16, padding: "48px 24px", textAlign: "center", border: "2px dashed #e2e8f0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
          <div style={{ fontWeight: 700, color: "#64748b" }}>Henüz yetki grubu yok</div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>Grup olmadan kullanıcılar rollerine göre varsayılan erişime sahip olur.</div>
        </div>
      ) : groups.map(g => {
        const expanded = expandedId === g.id;
        const notInGroup = users.filter(u => !g.users.some(gu => gu.id === u.id));
        return (
          <div key={g.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e9d5ff", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }} onClick={() => setExpandedId(expanded ? null : g.id)}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{g.name}</span>
                  {g.isBuiltIn && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "#f1f5f9", color: "#64748b" }}>Sistem</span>}
                  {g.isSelfOnly && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "#fef3c7", color: "#d97706" }}>Sadece Kendi</span>}
                </div>
                {g.description && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{g.description}</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {g.allowedModules.map(m => {
                    const mod = ALL_MODULES.find(am => am.key === m);
                    return <span key={m} style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "#f5f3ff", color: "#7c3aed" }}>{mod?.label ?? m}</span>;
                  })}
                  {g.allowedModules.length === 0 && <span style={{ fontSize: 11, color: "#94a3b8" }}>Menü izni yok</span>}
                </div>
              </div>
              <span style={{ fontSize: 13, color: "#94a3b8", flexShrink: 0 }}>{g.userCount} kullanıcı</span>
              {!g.isBuiltIn && <button onClick={e => { e.stopPropagation(); openEdit(g); }} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #e9d5ff", background: "#faf5ff", color: "#7c3aed", fontWeight: 600, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>Düzenle</button>}
              {!g.isBuiltIn && <button onClick={e => { e.stopPropagation(); del(g); }} style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #fee2e2", background: "#fef2f2", color: "#ef4444", fontWeight: 600, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>Sil</button>}
              <span style={{ color: "#94a3b8", fontSize: 14, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
            </div>

            {expanded && (
              <div style={{ borderTop: "1px solid #f1f5f9", padding: "14px 20px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>KULLANICILAR</div>
                {g.users.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 10 }}>Bu grupta kullanıcı yok.</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  {g.users.map(u => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 12px", borderRadius: 20, background: "#f5f3ff", border: "1px solid #e9d5ff" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{u.fullName}</span>
                      {u.role && <span style={{ fontSize: 10, color: "#94a3b8" }}>({u.role})</span>}
                      <button onClick={() => removeUser(g.id, u.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
                    </div>
                  ))}
                </div>
                {notInGroup.length > 0 && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <select value={addUserId[g.id] ?? ""} onChange={e => setAddUserId(prev => ({ ...prev, [g.id]: e.target.value }))}
                      style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, background: "#fff" }}>
                      <option value="">Kullanıcı seçin...</option>
                      {notInGroup.map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.roleName ?? "—"})</option>)}
                    </select>
                    <button onClick={() => assignUser(g.id)} disabled={!addUserId[g.id]} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: addUserId[g.id] ? "#7c3aed" : "#e9d5ff", color: addUserId[g.id] ? "#fff" : "#a78bfa", fontWeight: 700, fontSize: 13, cursor: addUserId[g.id] ? "pointer" : "not-allowed" }}>Ekle</button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {showForm && (
        <>
          <div onClick={() => setShowForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 500 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(580px,92vw)", maxHeight: "90vh", overflowY: "auto", zIndex: 501, background: "#fff", borderRadius: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.15)", padding: 28 }}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 20 }}>{editGroup ? "Grubu Düzenle" : "Yeni Yetki Grubu"}</div>
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={lblSt}>Grup Adı *</label><input value={formName} onChange={e => setFormName(e.target.value)} required style={inpSt} placeholder="ör. Resepsiyon, Kasiyer..." /></div>
              <div><label style={lblSt}>Açıklama</label><input value={formDesc} onChange={e => setFormDesc(e.target.value)} style={inpSt} placeholder="İsteğe bağlı" /></div>
              <div>
                <div style={{ ...lblSt, marginBottom: 8 }}>İzin Verilen Menüler</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {ALL_MODULES.map(m => (
                    <label key={m.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, border: `1px solid ${formModules.includes(m.key) ? "#7c3aed" : "#e2e8f0"}`, background: formModules.includes(m.key) ? "#f5f3ff" : "#fff", cursor: "pointer", fontSize: 13 }}>
                      <input type="checkbox" checked={formModules.includes(m.key)} onChange={() => toggleMod(m.key)} style={{ accentColor: "#7c3aed" }} />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 12px", borderRadius: 10, border: "1px solid #e2e8f0", background: formSelfOnly ? "#fef3c7" : "#fff" }}>
                <input type="checkbox" checked={formSelfOnly} onChange={e => setFormSelfOnly(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#d97706" }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Sadece kendi verilerini görsün</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Stilistler için: sadece kendi randevu ve görevleri</div>
                </div>
              </label>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>İptal</button>
                <button type="submit" disabled={saving} style={{ padding: "9px 24px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{saving ? "Kaydediliyor..." : editGroup ? "Güncelle" : "Oluştur"}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

const lblSt: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 5 };
const inpSt: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" };

/* ════════════════════════════════════════════════════════════════════
   BİLDİRİMLER TAB
   ════════════════════════════════════════════════════════════════════ */

type NotifChannels = { email: boolean; whatsapp: boolean; sms: boolean };
type NotifEntry    = { enabled: boolean } & NotifChannels & { minutesBefore?: number; daysAfter?: number };
type NotifConfig   = Record<string, NotifEntry>;

const NOTIF_TYPES: { key: string; label: string; icon: string; desc: string; extras?: React.ReactNode }[] = [
  { key: "booking_approved",       label: "Randevu Onayı",            icon: "✅", desc: "Talep onaylandığında müşteriye gönderilir." },
  { key: "booking_rejected",       label: "Randevu Reddi",            icon: "❌", desc: "Talep reddedildiğinde müşteriye gönderilir." },
  { key: "appointment_reminder",   label: "Randevu Hatırlatma",       icon: "⏰", desc: "Randevudan önce otomatik hatırlatma." },
  { key: "welcome",                label: "Hoş Geldin",               icon: "👋", desc: "Yeni müşteri kayıt olduğunda gönderilir." },
  { key: "birthday",               label: "Doğum Günü",               icon: "🎂", desc: "Müşterinin doğum gününde gönderilir." },
  { key: "receipt",                label: "Adisyon / Fatura",         icon: "🧾", desc: "Kasa kapandığında müşteriye gönderilir." },
  { key: "win_back",               label: "Geri Kazan",               icon: "💌", desc: "Uzun süre gelmemiş müşteriler için." },
  { key: "goodbye",                label: "Hoşçakal",                 icon: "👋", desc: "Hesabı silinen veya ayrılan müşterilere." },
];

const DEFAULT_ENTRY: NotifEntry = { enabled: false, email: true, whatsapp: false, sms: false };

function BildirimlerTab() {
  const { toast } = useToast();
  const [config,  setConfig]  = useState<NotifConfig>({});
  const [orgData, setOrgData] = useState<Record<string, unknown>>({});
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/Settings/organization").then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setOrgData(d);
        if (d.notificationConfig) {
          try { setConfig(JSON.parse(d.notificationConfig as string)); } catch { /* ignore */ }
        }
      }
      setLoading(false);
    });
  }, []);

  const entry = (key: string): NotifEntry => ({ ...DEFAULT_ENTRY, ...(config[key] ?? {}) });

  const update = (key: string, patch: Partial<NotifEntry>) =>
    setConfig(prev => ({ ...prev, [key]: { ...entry(key), ...patch } }));

  const save = async () => {
    setSaving(true);
    const r = await apiFetch("/Settings/organization", {
      method: "PUT",
      body: JSON.stringify({
        companyName:      orgData.companyName      ?? "",
        applicationTitle: orgData.applicationTitle ?? "",
        logoUrl:          orgData.logoUrl          ?? "",
        primaryColor:     orgData.primaryColor     ?? "#7c3aed",
        mfaEnabled:       orgData.mfaEnabled       ?? false,
        notificationConfig: JSON.stringify(config),
      }),
    });
    setSaving(false);
    if (r.ok) toast.success("Bildirim ayarları kaydedildi.");
    else      toast.error("Kaydedilemedi.");
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>;

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20, lineHeight: 1.6 }}>
        Sistem tarafından otomatik gönderilecek bildirimleri ve hangi kanallardan iletileceğini buradan yönetin.
        <br />
        <span style={{ fontSize: 11, color: "#94a3b8" }}>WhatsApp ve SMS kanalları ilgili entegrasyon tamamlanınca etkinleşir.</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {NOTIF_TYPES.map(nt => {
          const e = entry(nt.key);
          return (
            <div key={nt.key} style={{
              background: "var(--surface,#fff)", borderRadius: 14,
              border: `1px solid ${e.enabled ? "#e9d5ff" : "#eaecf0"}`,
              overflow: "hidden",
            }}>
              {/* Header row */}
              <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{nt.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{nt.label}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{nt.desc}</div>
                </div>
                {/* Toggle */}
                <label style={{ position: "relative", display: "inline-block", width: 48, height: 26, flexShrink: 0, cursor: "pointer" }}>
                  <input type="checkbox" checked={e.enabled} onChange={ev => update(nt.key, { enabled: ev.target.checked })}
                    style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: "absolute", inset: 0, borderRadius: 13, transition: ".2s", background: e.enabled ? "#7c3aed" : "#d1d5db" }}>
                    <span style={{
                      position: "absolute", top: 3, left: e.enabled ? 25 : 3, width: 20, height: 20,
                      borderRadius: "50%", background: "#fff", transition: ".2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                    }} />
                  </span>
                </label>
              </div>

              {/* Channel selectors — only visible when enabled */}
              {e.enabled && (
                <div style={{ padding: "0 20px 14px", display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {(["email", "whatsapp", "sms"] as const).map(ch => (
                    <label key={ch} style={{
                      display: "flex", alignItems: "center", gap: 7, padding: "6px 14px",
                      borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 600,
                      border: `1px solid ${e[ch] ? "#7c3aed" : "#e2e8f0"}`,
                      background: e[ch] ? "#f5f3ff" : "#f8fafc",
                      color: e[ch] ? "#7c3aed" : "#64748b",
                    }}>
                      <input type="checkbox" checked={e[ch]} onChange={ev => update(nt.key, { [ch]: ev.target.checked })}
                        style={{ accentColor: "#7c3aed", width: 14, height: 14 }} />
                      {ch === "email" ? "📧 E-posta" : ch === "whatsapp" ? "💬 WhatsApp" : "📱 SMS"}
                    </label>
                  ))}

                  {nt.key === "appointment_reminder" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", fontSize: 13 }}>
                      <span style={{ color: "#64748b" }}>Randevudan</span>
                      <input type="number" min={10} max={10080} value={e.minutesBefore ?? 60}
                        onChange={ev => update(nt.key, { minutesBefore: Number(ev.target.value) })}
                        style={{ width: 72, padding: "5px 8px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, textAlign: "center" }} />
                      <span style={{ color: "#64748b" }}>dakika önce</span>
                    </div>
                  )}

                  {nt.key === "win_back" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", fontSize: 13 }}>
                      <span style={{ color: "#64748b" }}>Son ziyaretten</span>
                      <input type="number" min={7} max={365} value={e.daysAfter ?? 30}
                        onChange={ev => update(nt.key, { daysAfter: Number(ev.target.value) })}
                        style={{ width: 72, padding: "5px 8px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, textAlign: "center" }} />
                      <span style={{ color: "#64748b" }}>gün sonra</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={save} disabled={saving} style={{
          padding: "10px 28px", borderRadius: 10, border: "none",
          background: saving ? "#a78bfa" : "#7c3aed", color: "#fff",
          fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer",
        }}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
}

// ── KioskTab ─────────────────────────────────────────────────────────────────

type KioskCode = { id: string; code: string; label?: string; isActive: boolean; expiresAtUtc?: string; createdAtUtc: string };

function KioskTab() {
  const { toast, confirm } = useToast();
  const [codes,    setCodes]    = useState<KioskCode[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [label,    setLabel]    = useState("");
  const [expires,  setExpires]  = useState("");
  const [saving,   setSaving]   = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await apiFetch("/Kiosk/codes");
    if (r.ok) setCodes(await r.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const r = await apiFetch("/Kiosk/codes", {
      method: "POST",
      body: JSON.stringify({ label: label || undefined, expiresAtUtc: expires ? new Date(expires).toISOString() : undefined }),
    });
    setSaving(false);
    if (r.ok) {
      setLabel(""); setExpires(""); setShowForm(false);
      toast.success("Kiosk kodu oluşturuldu.");
      load();
    } else {
      toast.error("Kod oluşturulamadı.");
    }
  };

  const toggle = async (id: string) => {
    const r = await apiFetch(`/Kiosk/codes/${id}/toggle`, { method: "PATCH" });
    if (r.ok) { toast.success("Durum güncellendi."); load(); }
    else toast.error("Güncellenemedi.");
  };

  const remove = async (id: string, code: string) => {
    const ok = await confirm(`"${code}" kodunu silmek istediğinize emin misiniz?`);
    if (!ok) return;
    const r = await apiFetch(`/Kiosk/codes/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Kod silindi."); load(); }
    else toast.error("Silinemedi.");
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>📺 Kiosk Kodları</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            TV ekranında sıra takibi için kiosk kodları oluşturun. Giriş ekranında &ldquo;Kiosk Modu&rdquo; seçilerek kullanılır.
          </div>
        </div>
        <button onClick={() => setShowForm(true)} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Yeni Kod
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 14, padding: 20, marginBottom: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Yeni Kiosk Kodu</div>
          <div>
            <label style={lblSt}>Etiket (isteğe bağlı)</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Örn: Ana Ekran, Bekleme Odası…" style={inpSt} />
          </div>
          <div>
            <label style={lblSt}>Son Kullanım Tarihi (isteğe bağlı)</label>
            <input type="date" value={expires} onChange={e => setExpires(e.target.value)} style={inpSt} />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>İptal</button>
            <button type="submit" disabled={saving} style={{ padding: "9px 24px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {saving ? "Oluşturuluyor..." : "Oluştur"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
      ) : codes.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", background: "#fafafa", borderRadius: 12, border: "1px dashed #e2e8f0" }}>
          Henüz kiosk kodu oluşturulmadı.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {codes.map(c => (
            <div key={c.id} style={{
              background: "#fff", border: `1px solid ${c.isActive ? "#e9d5ff" : "#e2e8f0"}`,
              borderRadius: 12, padding: "14px 20px",
              display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
            }}>
              <div style={{
                fontFamily: "monospace", fontSize: 20, fontWeight: 900, letterSpacing: 2,
                color: c.isActive ? "#7c3aed" : "#94a3b8", flexShrink: 0,
              }}>{c.code}</div>
              <div style={{ flex: 1, minWidth: 120 }}>
                {c.label && <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{c.label}</div>}
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  Oluşturuldu: {new Date(c.createdAtUtc).toLocaleDateString("tr-TR")}
                  {c.expiresAtUtc && ` • Geçerli: ${new Date(c.expiresAtUtc).toLocaleDateString("tr-TR")}'e kadar`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{
                  padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: c.isActive ? "#f0fdf4" : "#f1f5f9",
                  color: c.isActive ? "#166534" : "#64748b",
                }}>{c.isActive ? "Aktif" : "Pasif"}</span>
                <button onClick={() => toggle(c.id)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer", color: "#344054" }}>
                  {c.isActive ? "Devre Dışı" : "Aktif Et"}
                </button>
                <button onClick={() => remove(c.id, c.code)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#fef2f2", fontWeight: 700, fontSize: 12, cursor: "pointer", color: "#b42318" }}>
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── EntegrasyonlarTab ─────────────────────────────────────────────────────────

type GCalStatus = { isConnected: boolean; calendarName?: string; connectedAt?: string; connectedEmail?: string; isConfigured: boolean };

function GCalCard({
  title, subtitle, status, loading, onConnect, onDisconnect, onSync,
  connecting, syncing, showSync,
}: {
  title: string; subtitle: string;
  status: GCalStatus | null; loading: boolean;
  onConnect: () => void; onDisconnect: () => void; onSync?: () => void;
  connecting: boolean; syncing?: boolean; showSync?: boolean;
}) {
  return (
    <div style={{ background: "var(--surface,#fff)", borderRadius: 16, border: "1px solid #eaecf0", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
          📅
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{subtitle}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "#94a3b8", fontSize: 13 }}>Yükleniyor...</div>
      ) : !status?.isConfigured ? (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fef3f2", border: "1px solid #fecaca", fontSize: 13, color: "#b42318" }}>
          ⚠️ Google entegrasyonu henüz yapılandırılmamış.
        </div>
      ) : status?.isConnected ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <span style={{ color: "#16a34a", fontSize: 18 }}>✓</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#166534" }}>Bağlantı aktif</div>
              {status.calendarName && <div style={{ fontSize: 12, color: "#166534" }}>{status.calendarName}</div>}
              {status.connectedEmail && <div style={{ fontSize: 11, color: "#4ade80" }}>{status.connectedEmail}</div>}
              {status.connectedAt && <div style={{ fontSize: 11, color: "#86efac" }}>Bağlandı: {new Date(status.connectedAt).toLocaleDateString("tr-TR")}</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {showSync && onSync && (
              <button onClick={onSync} disabled={syncing} style={{
                flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
                background: syncing ? "#a78bfa" : "#7c3aed", color: "#fff",
                fontWeight: 700, fontSize: 13, cursor: syncing ? "not-allowed" : "pointer",
              }}>
                {syncing ? "Senkronize ediliyor..." : "🔄 Senkronize Et"}
              </button>
            )}
            <button onClick={onDisconnect} style={{
              padding: "10px 18px", borderRadius: 10, border: "1px solid #fee2e2",
              background: "#fef2f2", color: "#b42318", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              Bağlantıyı Kes
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
            Google hesabınıza bağlanarak randevularınızı otomatik olarak takviminize aktarın.
          </div>
          <button onClick={onConnect} disabled={connecting} style={{
            width: "100%", padding: "12px 0", borderRadius: 10,
            border: "1px solid #e2e8f0", background: "#fff",
            fontWeight: 700, fontSize: 14, cursor: connecting ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)", opacity: connecting ? 0.7 : 1,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {connecting ? "Google'a yönlendiriliyor..." : "Google ile Bağlan"}
          </button>
        </div>
      )}
    </div>
  );
}

function EntegrasyonlarTab() {
  const { toast } = useToast();
  const [salonStatus, setSalonStatus]   = useState<GCalStatus | null>(null);
  const [selfStatus,  setSelfStatus]    = useState<GCalStatus | null>(null);
  const [myRole,      setMyRole]        = useState<string>("");
  const [loading,     setLoading]       = useState(true);
  const [salonConn,   setSalonConn]     = useState(false);
  const [selfConn,    setSelfConn]      = useState(false);
  const [syncing,     setSyncing]       = useState(false);
  const [selfSyncing, setSelfSyncing]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [r1, r2, r3] = await Promise.all([
      apiFetch("/GoogleCalendar/status"),
      apiFetch("/GoogleCalendar/status?forSelf=true"),
      apiFetch("/Auth/me"),
    ]);
    if (r1.ok) setSalonStatus(await r1.json());
    if (r2.ok) setSelfStatus(await r2.json());
    if (r3.ok) { const me = await r3.json(); setMyRole(me.role ?? ""); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const connectSalon = async () => {
    setSalonConn(true);
    const r = await apiFetch("/GoogleCalendar/auth-url");
    if (r.ok) { const { url } = await r.json(); window.location.href = url; }
    else { toast.error("Bağlantı başlatılamadı."); setSalonConn(false); }
  };

  const disconnectSalon = async () => {
    const r = await apiFetch("/GoogleCalendar/disconnect", { method: "DELETE" });
    if (r.ok) { toast.success("Salon Calendar bağlantısı kesildi."); load(); }
    else toast.error("Bağlantı kesilemedi.");
  };

  const sync = async () => {
    setSyncing(true);
    const r = await apiFetch("/GoogleCalendar/sync", { method: "POST" });
    const d = await r.json().catch(() => ({})) as { message?: string };
    setSyncing(false);
    if (r.ok) toast.success(d.message ?? "Senkronize edildi.");
    else toast.error("Senkronizasyon başarısız.");
  };

  const connectSelf = async () => {
    setSelfConn(true);
    const r = await apiFetch("/GoogleCalendar/auth-url?forSelf=true");
    if (r.ok) { const { url } = await r.json(); window.location.href = url; }
    else { toast.error("Bağlantı başlatılamadı."); setSelfConn(false); }
  };

  const disconnectSelf = async () => {
    const r = await apiFetch("/GoogleCalendar/disconnect?forSelf=true", { method: "DELETE" });
    if (r.ok) { toast.success("Kişisel Calendar bağlantısı kesildi."); load(); }
    else toast.error("Bağlantı kesilemedi.");
  };

  const syncSelf = async () => {
    setSelfSyncing(true);
    const r = await apiFetch("/GoogleCalendar/sync-personal", { method: "POST" });
    const d = await r.json().catch(() => ({})) as { message?: string };
    setSelfSyncing(false);
    if (r.ok) toast.success(d.message ?? "Kişisel takvim senkronize edildi.");
    else toast.error("Senkronizasyon başarısız.");
  };

  const isStylist   = myRole === "Stilist";
  const selfSubtitle = isStylist
    ? "Atanan randevularınız kişisel takviminize aktarılır"
    : "Tüm salon randevuları kişisel takviminize aktarılır";

  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 16 }}>
      <GCalCard
        title="Salon Google Calendar"
        subtitle="Tüm randevular otomatik olarak salon takvimine aktarılır"
        status={salonStatus}
        loading={loading}
        onConnect={connectSalon}
        onDisconnect={disconnectSalon}
        onSync={sync}
        connecting={salonConn}
        syncing={syncing}
        showSync
      />
      <GCalCard
        title="Kişisel Google Takvim"
        subtitle={selfSubtitle}
        status={selfStatus}
        loading={loading}
        onConnect={connectSelf}
        onDisconnect={disconnectSelf}
        onSync={syncSelf}
        connecting={selfConn}
        syncing={selfSyncing}
        showSync
      />
      <WhatsAppSettingsCard />
    </div>
  );
}

function WhatsAppSettingsCard() {
  const { toast } = useToast();
  const [isActive,   setIsActive]   = useState(false);
  const [apiToken,   setApiToken]   = useState("");
  const [phoneNumId, setPhoneNumId] = useState("");
  const [fromNumber, setFromNumber] = useState("");
  const [hasToken,   setHasToken]   = useState(false);
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    apiFetch("/WhatsApp/settings").then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      setIsActive(d.isActive);
      setPhoneNumId(d.phoneNumberId ?? "");
      setFromNumber(d.fromNumber ?? "");
      setHasToken(d.hasToken);
    });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const r = await apiFetch("/WhatsApp/settings", {
      method: "PUT",
      body: JSON.stringify({ isActive, apiToken: apiToken || undefined, phoneNumberId: phoneNumId || undefined, fromNumber: fromNumber || undefined }),
    });
    setSaving(false);
    if (r.ok) { setApiToken(""); setHasToken(true); toast.success("WhatsApp ayarları kaydedildi."); }
    else toast.error("Kaydedilemedi.");
  };

  return (
    <div style={{ background: "var(--surface,#fff)", borderRadius: 16, border: "1px solid #eaecf0", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
          💬
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>WhatsApp Business API</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Meta Business API entegrasyonu</div>
        </div>
        <label style={{ marginLeft: "auto", position: "relative", display: "inline-block", width: 48, height: 26, flexShrink: 0, cursor: "pointer" }}>
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
          <span style={{ position: "absolute", inset: 0, borderRadius: 13, transition: ".2s", background: isActive ? "#25d366" : "#d1d5db" }}>
            <span style={{ position: "absolute", top: 3, left: isActive ? 25 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: ".2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
          </span>
        </label>
      </div>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={lblSt}>API Token {hasToken && <span style={{ color: "#16a34a", fontSize: 11 }}>✓ Kayıtlı</span>}</label>
          <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder={hasToken ? "Değiştirmek için yeni token girin" : "whatsapp_token_..."}
            style={inpSt} />
        </div>
        <div>
          <label style={lblSt}>Phone Number ID</label>
          <input value={phoneNumId} onChange={e => setPhoneNumId(e.target.value)} placeholder="123456789012345" style={inpSt} />
        </div>
        <div>
          <label style={lblSt}>Gönderici Numara</label>
          <input value={fromNumber} onChange={e => setFromNumber(e.target.value)} placeholder="+905001234567" style={inpSt} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" disabled={saving} style={{ padding: "9px 24px", borderRadius: 10, border: "none", background: saving ? "#a78bfa" : "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}
