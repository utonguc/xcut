"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type Role           = { id: string; name: string };
type UserItem       = { id: string; fullName: string; userName: string; email: string; isActive: boolean; roleId?: string; roleName?: string };
type OrgSettings    = { id: string; companyName: string; applicationTitle: string; logoUrl?: string; primaryColor: string };
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
  Resepsiyon: "#0e7490",
};

export default function SettingsPage() {
  const [tab, setTab] = useState<"org" | "users" | "banka" | "yetki" | "security">("org");

  return (
    <AppShell title="Ayarlar" description="Kurum, kullanıcı ve güvenlik yönetimi">
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#f1f5f9", borderRadius: 12, padding: 4, width: "fit-content", flexWrap: "wrap" }}>
        {([
          ["org",      "🏢 Kurum"],
          ["users",    "👥 Kullanıcılar"],
          ["banka",    "🏦 Banka Hesapları"],
          ["yetki",    "🔐 Yetki Grupları"],
          ["security", "🔒 Güvenlik"],
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

      {tab === "org"      && <OrgTab />}
      {tab === "users"    && <UsersTab />}
      {tab === "banka"    && <BankaTab />}
      {tab === "yetki"    && <YetkiTab />}
      {tab === "security" && <SecurityTab />}
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
      body: JSON.stringify({ companyName: org.companyName, applicationTitle: org.applicationTitle, logoUrl: org.logoUrl, primaryColor: org.primaryColor }),
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

  const [fullName, setFullName] = useState("");
  const [userName, setUserName] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId]     = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const [rRes, uRes] = await Promise.all([apiFetch("/Users/roles"), apiFetch("/Users")]);
    if (rRes.ok) setRoles(await rRes.json());
    if (uRes.ok) setUsers(await uRes.json());
  };

  useEffect(() => { load(); }, []);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const r = await apiFetch("/Users", { method: "POST", body: JSON.stringify({ fullName, userName, email, password, roleId }) });
    const d = await r.json().catch(() => ({}));
    setCreating(false);
    setMsg({ text: d.message ?? (r.ok ? "Kullanıcı oluşturuldu." : "Hata."), ok: r.ok });
    if (r.ok) { setFullName(""); setUserName(""); setEmail(""); setPassword(""); setRoleId(""); setShowForm(false); load(); }
  };

  const updateUser = async (u: UserItem, newRoleId: string, newActive: boolean) => {
    await apiFetch(`/Users/${u.id}`, { method: "PUT", body: JSON.stringify({ fullName: u.fullName, email: u.email, roleId: newRoleId, isActive: newActive }) });
    load();
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
        <form onSubmit={createUser} style={{ background: "var(--surface, #fff)", borderRadius: 16, border: "1px solid #eaecf0", padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Ad Soyad *</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Kullanıcı Adı *</label>
            <input value={userName} onChange={e => setUserName(e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>E-posta *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Şifre *</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Rol *</label>
            <select value={roleId} onChange={e => setRoleId(e.target.value)} required style={inputStyle}>
              <option value="">Seçiniz</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" disabled={creating} style={{
              width: "100%", padding: "10px", borderRadius: 10, border: "none",
              background: creating ? "#a78bfa" : "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>{creating ? "Oluşturuluyor..." : "Oluştur"}</button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {users.map(u => {
          const rc = ROLE_COLOR[u.roleName ?? ""] ?? "#374151";
          return (
            <div key={u.id} style={{ background: "var(--surface, #fff)", borderRadius: 14, border: "1px solid #eaecf0", padding: "14px 20px",
              display: "flex", alignItems: "center", gap: 16 }}>
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
                background: `${rc}20`, color: rc, border: `1px solid ${rc}40`,
              }}>{u.roleName ?? "—"}</span>
              <select value={u.roleId ?? ""} onChange={e => updateUser(u, e.target.value, u.isActive)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e4e7ec", fontSize: 12, maxWidth: 150 }}>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
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
    if (!confirm("Bu hesabı silmek istediğinizden emin misiniz?")) return;
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
    if (r.ok) { setShowForm(false); load(); } else alert("Kaydedilemedi.");
  };

  const del = async (g: PermGroup) => {
    if (!confirm(`"${g.name}" grubunu silmek istiyor musunuz?`)) return;
    await apiFetch(`/PermissionGroup/${g.id}`, { method: "DELETE" });
    load();
  };

  const assignUser = async (groupId: string) => {
    const uid = addUserId[groupId];
    if (!uid) return;
    const r = await apiFetch(`/PermissionGroup/${groupId}/users`, { method: "POST", body: JSON.stringify({ userId: uid }) });
    if (r.ok) { setAddUserId(prev => ({ ...prev, [groupId]: "" })); load(); } else alert("Eklenemedi.");
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
