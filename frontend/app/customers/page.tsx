"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { exportCsv } from "@/lib/export";

/* ── Types ─────────────────────────────────────────────────────── */
type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  gender?: string;
  notes?: string;
  leadStatus?: string;
  leadSource?: string;
  createdAt?: string;
};

/* ── Constants ──────────────────────────────────────────────────── */
const LEAD_STATUSES = ["Yeni","İletişim Kuruldu","Teklif Verildi","Randevu Oluştu","İşlem Yapıldı","İptal"];
const LEAD_SOURCES  = ["Instagram","Facebook","Google","TikTok","Referans","Walk-in","Diğer"];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  "Yeni":             { bg: "#dbeafe", color: "#1e40af" },
  "İletişim Kuruldu": { bg: "#fef3c7", color: "#92400e" },
  "Teklif Verildi":   { bg: "#ede9fe", color: "#5b21b6" },
  "Randevu Oluştu":   { bg: "#d1fae5", color: "#065f46" },
  "İşlem Yapıldı":    { bg: "#dcfce7", color: "#166534" },
  "İptal":            { bg: "#fee2e2", color: "#991b1b" },
};

/* ── Page ───────────────────────────────────────────────────────── */
export default function CustomersPage() {
  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState("");
  const [view,       setView]       = useState<"list"|"kanban">("list");
  const [showModal,  setShowModal]  = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/Customers?search=${encodeURIComponent(search)}&pageSize=100`);
      if (r.ok) setCustomers(await r.json());
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const del = async (id: string) => {
    if (!confirm("Bu müşteriyi silmek istediğinizden emin misiniz?")) return;
    await apiFetch(`/Customers/${id}`, { method: "DELETE" });
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    await apiFetch(`/Customers/${id}/lead-status`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  };

  const handleExport = () => {
    exportCsv(
      customers.map(c => ({
        "Ad": c.firstName, "Soyad": c.lastName,
        "Telefon": c.phone ?? "", "E-posta": c.email ?? "",
        "Durum": c.leadStatus ?? "", "Kaynak": c.leadSource ?? "",
      })),
      "musteriler"
    );
  };

  const filtered = customers.filter(c =>
    (c.firstName + " " + c.lastName + " " + (c.phone ?? "") + " " + (c.email ?? ""))
      .toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell
      title="Müşteriler"
      description="Tüm müşterilerinizi yönetin"
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowImport(true)} className="btn btn-ghost" style={{ fontSize: 13 }}>📤 İçe Aktar</button>
          <button onClick={handleExport} className="btn btn-ghost" style={{ fontSize: 13 }}>📥 Dışa Aktar</button>
          <button onClick={() => { setEditCustomer(null); setShowModal(true); }} className="btn btn-primary">+ Müşteri</button>
        </div>
      }
    >
      {/* Toolbar */}
      <div className="toolbar">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="İsim, telefon veya e-posta ara..."
          className="inp"
          style={{ maxWidth: 320 }}
        />
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {(["list","kanban"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`btn ${view === v ? "btn-primary" : "btn-ghost"}`} style={{ padding: "8px 14px", minHeight: 40, fontSize: 13 }}>
              {v === "list" ? "☰ Liste" : "⊞ Kanban"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
          Yükleniyor...
        </div>
      ) : view === "list" ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--surface-2,#f8fafc)" }}>
                {["Müşteri","Telefon","E-posta","Durum","Kaynak",""].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "#64748b", borderBottom: "1px solid var(--border,#eaecf0)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Müşteri bulunamadı</td></tr>
              )}
              {filtered.map(c => {
                const sc = STATUS_COLORS[c.leadStatus ?? "Yeni"] ?? STATUS_COLORS["Yeni"];
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--border,#f2f4f7)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 700 }}>{c.firstName} {c.lastName}</div>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#64748b" }}>{c.phone ?? "—"}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b" }}>{c.email ?? "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <select
                        value={c.leadStatus ?? "Yeni"}
                        onChange={e => updateStatus(c.id, e.target.value)}
                        style={{ padding: "4px 8px", borderRadius: 8, border: "none", background: sc.bg, color: sc.color, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                      >
                        {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#64748b", fontSize: 12 }}>{c.leadSource ?? "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => { setEditCustomer(c); setShowModal(true); }} className="btn btn-ghost" style={{ padding: "6px 12px", minHeight: 34, fontSize: 12 }}>Düzenle</button>
                        <button onClick={() => del(c.id)} style={{ padding: "6px 10px", minHeight: 34, borderRadius: 8, border: "1px solid #fee2e2", background: "#fef2f2", color: "#ef4444", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Sil</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── KANBAN VIEW ── */
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {LEAD_STATUSES.map(status => {
            const col = filtered.filter(c => (c.leadStatus ?? "Yeni") === status);
            const sc = STATUS_COLORS[status];
            return (
              <div key={status} style={{ minWidth: 220, maxWidth: 240, flexShrink: 0 }}>
                <div style={{
                  padding: "10px 14px", borderRadius: "12px 12px 0 0",
                  background: sc.bg, borderBottom: "2px solid " + sc.color,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: sc.color }}>{status}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: sc.color, color: "#fff" }}>{col.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 4px", background: "var(--surface-2,#f8fafc)", borderRadius: "0 0 12px 12px", minHeight: 100 }}>
                  {col.map(c => (
                    <div key={c.id} className="card" style={{ padding: "12px 14px", cursor: "pointer" }}
                      onClick={() => { setEditCustomer(c); setShowModal(true); }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{c.firstName} {c.lastName}</div>
                      {c.phone && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{c.phone}</div>}
                      {c.leadSource && <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.leadSource}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <CustomerModal
          customer={editCustomer}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}

      {showImport && (
        <CsvImportModal
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); load(); }}
        />
      )}
    </AppShell>
  );
}

/* ── Customer Modal ─────────────────────────────────────────────── */
function CustomerModal({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!customer?.id;
  const [form, setForm] = useState({
    firstName: customer?.firstName ?? "",
    lastName:  customer?.lastName ?? "",
    phone:     customer?.phone ?? "",
    email:     customer?.email ?? "",
    birthDate: customer?.birthDate?.slice(0,10) ?? "",
    gender:    customer?.gender ?? "",
    leadSource: customer?.leadSource ?? "",
    notes:     customer?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const save = async () => {
    if (!form.firstName) { setError("Ad zorunludur."); return; }
    setSaving(true);
    try {
      const res = isEdit
        ? await apiFetch(`/Customers/${customer!.id}`, { method: "PUT", body: JSON.stringify(form) })
        : await apiFetch("/Customers", { method: "POST", body: JSON.stringify(form) });
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
          <div style={{ fontWeight: 800, fontSize: 17 }}>{isEdit ? "Müşteri Düzenle" : "Yeni Müşteri"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="form-grid">
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Ad *</label><input value={form.firstName} onChange={set("firstName")} style={s} placeholder="Ad" /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Soyad</label><input value={form.lastName} onChange={set("lastName")} style={s} placeholder="Soyad" /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Telefon</label><input value={form.phone} onChange={set("phone")} style={s} placeholder="+90 5xx" /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>E-posta</label><input type="email" value={form.email} onChange={set("email")} style={s} placeholder="email@" /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Doğum Tarihi</label><input type="date" value={form.birthDate} onChange={set("birthDate")} style={s} /></div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Cinsiyet</label>
              <select value={form.gender} onChange={set("gender")} style={s}>
                <option value="">Seçiniz</option>
                <option value="Male">Erkek</option>
                <option value="Female">Kadın</option>
                <option value="Other">Diğer</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Kaynak</label>
            <select value={form.leadSource} onChange={set("leadSource")} style={s}>
              <option value="">Seçiniz</option>
              {LEAD_SOURCES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Notlar</label>
            <textarea value={form.notes} onChange={set("notes")} rows={2} style={{ ...s, resize: "vertical" }} placeholder="İsteğe bağlı not..." />
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

/* ── CSV Import Modal ────────────────────────────────────────────── */
function CsvImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file,     setFile]     = useState<File | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<{ imported: number; errors: number } | null>(null);
  const [error,    setError]    = useState("");

  const download = () => {
    const csv = "Ad,Soyad,Telefon,EMail,Cinsiyet,Kaynak,Notlar\n";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "musteri-sablonu.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async () => {
    if (!file) { setError("Dosya seçiniz."); return; }
    setLoading(true); setError("");
    const form = new FormData(); form.append("file", file);
    try {
      const res = await apiFetch("/Customers/import", { method: "POST", headers: {}, body: form });
      if (res.ok) { const d = await res.json(); setResult(d); }
      else setError("Yükleme başarısız");
    } finally { setLoading(false); }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, backdropFilter: "blur(3px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(420px, 92vw)", zIndex: 301, background: "var(--surface,#fff)", borderRadius: 20, boxShadow: "0 24px 64px rgba(15,23,42,0.22)", border: "1px solid var(--border,#eaecf0)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>CSV İçe Aktar</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <button onClick={download} className="btn btn-ghost" style={{ fontSize: 13 }}>📥 Şablon İndir</button>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>CSV Dosyası</label>
            <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 14 }} />
          </div>
          {result && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#f0fdf4", color: "#166534", fontSize: 13, fontWeight: 600 }}>
              ✓ {result.imported} kayıt aktarıldı, {result.errors} hata.
            </div>
          )}
          {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", color: "#b42318", fontSize: 13, fontWeight: 600 }}>⚠ {error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>İptal</button>
            {result ? (
              <button onClick={onDone} className="btn btn-primary" style={{ flex: 2 }}>Tamam</button>
            ) : (
              <button onClick={upload} disabled={loading || !file} className="btn btn-primary" style={{ flex: 2, opacity: loading ? 0.7 : 1 }}>
                {loading ? "Yükleniyor..." : "Yükle"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
