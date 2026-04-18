"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch, staticUrl } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────── */
type Stylist = {
  id: string;
  fullName: string;
  specialty?: string;
  branch?: string;
  phone?: string;
  email?: string;
  bio?: string;
  photoUrl?: string;
  isActive: boolean;
  appointmentsCount?: number;
};

type ScheduleDay = {
  dayOfWeek: number;
  isWorking: boolean;
  startTime: string;
  endTime: string;
  slotMinutes: number;
};

type Leave = {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string;
};

/* ── Stylist Card ───────────────────────────────────────────────── */
function StylistCard({ stylist, onEdit, onSchedule }: { stylist: Stylist; onEdit: () => void; onSchedule: () => void }) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {/* Photo */}
        <div style={{
          width: 64, height: 64, borderRadius: 16, flexShrink: 0,
          background: "var(--primary-light,#ede9fe)", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, border: "2px solid var(--border,#eaecf0)",
        }}>
          {stylist.photoUrl
            ? <img src={staticUrl(stylist.photoUrl)} alt={stylist.fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : "✂️"
          }
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 2 }}>{stylist.fullName}</div>
          {stylist.specialty && <div style={{ fontSize: 13, color: "#7c3aed", fontWeight: 600 }}>{stylist.specialty}</div>}
          {stylist.branch    && <div style={{ fontSize: 12, color: "#64748b" }}>{stylist.branch}</div>}
          {stylist.phone     && <div style={{ fontSize: 12, color: "#64748b" }}>📞 {stylist.phone}</div>}
        </div>
        <span className="badge" style={{ background: stylist.isActive ? "#dcfce7" : "#fee2e2", color: stylist.isActive ? "#166534" : "#991b1b", flexShrink: 0 }}>
          {stylist.isActive ? "Aktif" : "Pasif"}
        </span>
      </div>
      {stylist.bio && <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, borderTop: "1px solid var(--border,#f2f4f7)", paddingTop: 10 }}>{stylist.bio}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
        <button onClick={onEdit} className="btn btn-ghost" style={{ flex: 1, fontSize: 13 }}>✏️ Düzenle</button>
        <button onClick={onSchedule} className="btn btn-ghost" style={{ flex: 1, fontSize: 13 }}>📅 Program</button>
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */
export default function StylistsPage() {
  const [stylists,    setStylists]    = useState<Stylist[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [showModal,   setShowModal]   = useState(false);
  const [editStylist, setEditStylist] = useState<Stylist | null>(null);
  const [schedModal,  setSchedModal]  = useState<Stylist | null>(null);
  const [filterActive, setFilterActive] = useState("true");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterActive !== "all" ? `?activeOnly=${filterActive}` : "";
      const r = await apiFetch(`/Stylists${params}`);
      if (r.ok) setStylists(await r.json());
    } finally { setLoading(false); }
  }, [filterActive]);

  useEffect(() => { load(); }, [load]);

  return (
    <AppShell
      title="Stilistler"
      description="Çalışan stilistlerinizi yönetin"
      actions={
        <button onClick={() => { setEditStylist(null); setShowModal(true); }} className="btn btn-primary">+ Stilist</button>
      }
    >
      <div className="toolbar">
        <div style={{ display: "flex", gap: 4 }}>
          {[["true","Aktif"],["false","Pasif"],["all","Tümü"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilterActive(v)} className={`btn ${filterActive === v ? "btn-primary" : "btn-ghost"}`} style={{ padding: "8px 14px", minHeight: 40, fontSize: 13 }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
          Yükleniyor...
        </div>
      ) : stylists.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✂️</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Stilist bulunamadı</div>
          <button onClick={() => { setEditStylist(null); setShowModal(true); }} className="btn btn-primary">İlk Stilisti Ekle</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {stylists.map(s => (
            <StylistCard
              key={s.id}
              stylist={s}
              onEdit={() => { setEditStylist(s); setShowModal(true); }}
              onSchedule={() => setSchedModal(s)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <StylistModal
          stylist={editStylist}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
      {schedModal && (
        <ScheduleModal
          stylist={schedModal}
          onClose={() => setSchedModal(null)}
        />
      )}
    </AppShell>
  );
}

/* ── Stylist Modal ──────────────────────────────────────────────── */
function StylistModal({ stylist, onClose, onSaved }: { stylist: Stylist | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!stylist?.id;
  const [form, setForm] = useState({
    fullName:  stylist?.fullName ?? "",
    specialty: stylist?.specialty ?? "",
    branch:    stylist?.branch ?? "",
    phone:     stylist?.phone ?? "",
    email:     stylist?.email ?? "",
    bio:       stylist?.bio ?? "",
    isActive:  stylist?.isActive ?? true,
  });
  const [photo,   setPhoto]   = useState<File | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const save = async () => {
    if (!form.fullName) { setError("Ad zorunludur."); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)));
      if (photo) fd.append("photo", photo);
      const res = isEdit
        ? await apiFetch(`/Stylists/${stylist!.id}`, { method: "PUT", headers: {}, body: fd })
        : await apiFetch("/Stylists", { method: "POST", headers: {}, body: fd });
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
          <div style={{ fontWeight: 800, fontSize: 17 }}>{isEdit ? "Stilist Düzenle" : "Yeni Stilist"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="form-grid">
            <div className="form-full"><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Ad Soyad *</label><input value={form.fullName} onChange={set("fullName")} style={s} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Uzmanlık</label><input value={form.specialty} onChange={set("specialty")} style={s} placeholder="Saç kesimi, boya..." /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Şube</label><input value={form.branch} onChange={set("branch")} style={s} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Telefon</label><input value={form.phone} onChange={set("phone")} style={s} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>E-posta</label><input type="email" value={form.email} onChange={set("email")} style={s} /></div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Biyografi</label>
            <textarea value={form.bio} onChange={set("bio")} rows={3} style={{ ...s, resize: "vertical" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Fotoğraf</label>
            <input type="file" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] ?? null)} style={{ fontSize: 14 }} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={form.isActive} onChange={set("isActive")} style={{ width: 18, height: 18, accentColor: "#7c3aed" }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Aktif</span>
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

/* ── Schedule Modal ─────────────────────────────────────────────── */
const DAY_NAMES = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];

function ScheduleModal({ stylist, onClose }: { stylist: Stylist; onClose: () => void }) {
  const [schedule, setSchedule] = useState<ScheduleDay[]>(
    Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i, isWorking: i >= 1 && i <= 6,
      startTime: "09:00", endTime: "18:00", slotMinutes: 30,
    }))
  );
  const [leaves,   setLeaves]   = useState<Leave[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [leaveForm, setLeaveForm] = useState({ startDate: "", endDate: "", reason: "" });

  useEffect(() => {
    apiFetch(`/StylistSchedule/${stylist.id}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setSchedule(d); });
    apiFetch(`/StylistSchedule/${stylist.id}/leaves`).then(r => r.ok ? r.json() : []).then(setLeaves);
  }, [stylist.id]);

  const save = async () => {
    setSaving(true);
    await apiFetch(`/StylistSchedule/${stylist.id}`, { method: "PUT", body: JSON.stringify(schedule) });
    setSaving(false);
    onClose();
  };

  const addLeave = async () => {
    if (!leaveForm.startDate || !leaveForm.endDate) return;
    await apiFetch(`/StylistSchedule/${stylist.id}/leaves`, { method: "POST", body: JSON.stringify(leaveForm) });
    const r = await apiFetch(`/StylistSchedule/${stylist.id}/leaves`);
    if (r.ok) setLeaves(await r.json());
    setLeaveForm({ startDate: "", endDate: "", reason: "" });
  };

  const delLeave = async (id: string) => {
    await apiFetch(`/StylistSchedule/${stylist.id}/leaves/${id}`, { method: "DELETE" });
    setLeaves(prev => prev.filter(l => l.id !== id));
  };

  const s: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border,#d0d5dd)", fontSize: 13, background: "var(--surface,#fff)", color: "var(--text,#101828)" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, backdropFilter: "blur(3px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(600px, 94vw)", zIndex: 301, maxHeight: "92vh", overflowY: "auto", background: "var(--surface,#fff)", borderRadius: 20, boxShadow: "0 24px 64px rgba(15,23,42,0.22)", border: "1px solid var(--border,#eaecf0)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Program · {stylist.fullName}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Weekly schedule */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Haftalık Program</div>
            {schedule.map((day, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border,#f2f4f7)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, width: 120, cursor: "pointer" }}>
                  <input type="checkbox" checked={day.isWorking} onChange={e => setSchedule(prev => prev.map((d, j) => j === i ? { ...d, isWorking: e.target.checked } : d))} style={{ accentColor: "#7c3aed" }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{DAY_NAMES[i]}</span>
                </label>
                {day.isWorking && (
                  <>
                    <input type="time" value={day.startTime} onChange={e => setSchedule(prev => prev.map((d, j) => j === i ? { ...d, startTime: e.target.value } : d))} style={s} />
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>–</span>
                    <input type="time" value={day.endTime} onChange={e => setSchedule(prev => prev.map((d, j) => j === i ? { ...d, endTime: e.target.value } : d))} style={s} />
                    <select value={day.slotMinutes} onChange={e => setSchedule(prev => prev.map((d, j) => j === i ? { ...d, slotMinutes: Number(e.target.value) } : d))} style={s}>
                      {[15,20,30,45,60].map(m => <option key={m} value={m}>{m} dk</option>)}
                    </select>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Leaves */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>İzin / Tatil</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(p => ({ ...p, startDate: e.target.value }))} style={s} />
              <input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm(p => ({ ...p, endDate: e.target.value }))} style={s} />
              <input value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))} placeholder="Sebep..." style={{ ...s, flex: 1 }} />
              <button onClick={addLeave} className="btn btn-primary" style={{ minHeight: 38, padding: "8px 14px", fontSize: 13 }}>+ Ekle</button>
            </div>
            {leaves.map(l => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--surface-2,#f8fafc)", borderRadius: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, flex: 1 }}>{l.startDate} – {l.endDate} {l.reason && `(${l.reason})`}</span>
                <button onClick={() => delLeave(l.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>İptal</button>
            <button onClick={save} disabled={saving} className="btn btn-primary" style={{ flex: 2, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
