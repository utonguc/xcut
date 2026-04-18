"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type Role     = { id: string; name: string };
type UserItem = { id: string; fullName: string; userName: string; email: string; isActive: boolean; roleId?: string; roleName?: string };
type OrgSettings = { id: string; companyName: string; applicationTitle: string; logoUrl?: string; primaryColor: string };

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
  const [tab, setTab] = useState<"org" | "users" | "security">("org");

  return (
    <AppShell title="Ayarlar" description="Kurum, kullanıcı ve güvenlik yönetimi">
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#f1f5f9", borderRadius: 12, padding: 4, width: "fit-content" }}>
        {([
          ["org",      "🏢 Kurum"],
          ["users",    "👥 Kullanıcılar"],
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
