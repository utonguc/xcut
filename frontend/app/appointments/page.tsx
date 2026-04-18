"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { fmtTime, fmtDateTime, toIstMins, localToUtc } from "@/lib/tz";

/* ── Types ─────────────────────────────────────────────────────── */
type Customer = { id: string; firstName: string; lastName: string };
type Stylist  = { id: string; fullName: string; branch?: string };
type Appt     = {
  id: string; customerName?: string; patientFullName?: string;
  serviceName?: string; procedureName?: string;
  startAtUtc: string; endAtUtc: string; status: string;
  stylistName?: string; doctorFullName?: string;
  notes?: string;
};

/* ── Constants ──────────────────────────────────────────────────── */
const HOUR_START = 7;
const HOUR_END   = 21;
const HOUR_H     = 64;
const GRID_H     = (HOUR_END - HOUR_START) * HOUR_H;

const STATUSES: Record<string, { bg: string; color: string; bar: string; label: string }> = {
  Scheduled:  { bg: "#ede9fe", color: "#7c3aed", bar: "#7c3aed", label: "Planlandı" },
  Completed:  { bg: "#dcfce7", color: "#166534", bar: "#22c55e", label: "Tamamlandı" },
  Cancelled:  { bg: "#fee2e2", color: "#991b1b", bar: "#ef4444", label: "İptal" },
  NoShow:     { bg: "#fef3c7", color: "#92400e", bar: "#f59e0b", label: "Gelmedi" },
};

const DAYS = ["Paz","Pzt","Sal","Çar","Per","Cum","Cmt"];
const MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

function isoDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return r; }

function apptTop(utc: string) { return Math.max(0, (toIstMins(utc) - HOUR_START * 60) * (HOUR_H / 60)); }
function apptHeight(start: string, end: string) {
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  return Math.max(HOUR_H / 4, diff * (HOUR_H / 60));
}

/* ── Page ───────────────────────────────────────────────────────── */
export default function AppointmentsPage() {
  const [view,       setView]       = useState<"week"|"day"|"list">("week");
  const [date,       setDate]       = useState(() => new Date());
  const [appts,      setAppts]      = useState<Appt[]>([]);
  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [stylists,   setStylists]   = useState<Stylist[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterStylist, setFilterStylist] = useState("");
  const [showModal,  setShowModal]  = useState(false);
  const [editAppt,   setEditAppt]   = useState<Appt | null>(null);

  useEffect(() => {
    apiFetch("/Customers?pageSize=200").then(r => r.ok ? r.json() : []).then(setCustomers);
    apiFetch("/Stylists?activeOnly=true").then(r => r.ok ? r.json() : [])
      .then((d: Stylist[]) => setStylists(d))
      .catch(() =>
        apiFetch("/Doctors?activeOnly=true").then(r => r.ok ? r.json() : []).then(setStylists)
      );
  }, []);

  const weekStart = startOfWeek(date);
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const load = useCallback(async () => {
    setLoading(true);
    let start = "", end = "";
    if (view === "week") {
      const ws = startOfWeek(date);
      start = `${isoDate(ws)}T00:00:00Z`;
      end   = `${isoDate(addDays(ws, 6))}T23:59:59Z`;
    } else {
      start = `${isoDate(date)}T00:00:00Z`;
      end   = `${isoDate(date)}T23:59:59Z`;
    }
    const params = new URLSearchParams({ status: filterStatus, stylistId: filterStylist });
    if (view !== "list") { params.set("start", start); params.set("end", end); }
    try {
      const r = await apiFetch(`/Appointments?${params}`);
      if (r.ok) setAppts(await r.json());
    } finally { setLoading(false); }
  }, [date, view, filterStatus, filterStylist]);

  useEffect(() => { load(); }, [load]);

  const aptName = (a: Appt) => a.customerName ?? a.patientFullName ?? "?";
  const svcName = (a: Appt) => a.serviceName ?? a.procedureName ?? "";

  return (
    <AppShell
      title="Randevular"
      description="Tüm randevuları yönetin"
      actions={
        <button onClick={() => { setEditAppt(null); setShowModal(true); }} className="btn btn-primary" style={{ gap: 6 }}>
          + Randevu
        </button>
      }
    >
      {/* Toolbar */}
      <div className="toolbar">
        <input type="date" value={isoDate(date)} onChange={e => e.target.value && setDate(new Date(e.target.value + "T12:00:00"))}
          className="inp" style={{ width: 160, minHeight: 40 }} />

        <div style={{ display: "flex", gap: 4 }}>
          {(["week","day","list"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`btn ${view === v ? "btn-primary" : "btn-ghost"}`} style={{ padding: "8px 14px", minHeight: 40, fontSize: 13 }}>
              {v === "week" ? "Hafta" : v === "day" ? "Gün" : "Liste"}
            </button>
          ))}
        </div>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="inp" style={{ width: 140, minHeight: 40 }}>
          <option value="">Tüm Durumlar</option>
          {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        <select value={filterStylist} onChange={e => setFilterStylist(e.target.value)} className="inp" style={{ width: 160, minHeight: 40 }}>
          <option value="">Tüm Stilistler</option>
          {stylists.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
        </select>

        <button onClick={load} className="btn btn-ghost" style={{ minHeight: 40, marginLeft: "auto" }}>🔄 Yenile</button>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
          Yükleniyor...
        </div>
      ) : view === "list" ? (
        /* ── LIST VIEW ── */
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--surface-2,#f8fafc)" }}>
                {["Müşteri","Hizmet","Stilist","Tarih/Saat","Durum",""].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "#64748b", borderBottom: "1px solid var(--border,#eaecf0)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {appts.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Randevu bulunamadı</td></tr>
              )}
              {appts.map(a => {
                const st = STATUSES[a.status] ?? STATUSES.Scheduled;
                return (
                  <tr key={a.id} style={{ borderBottom: "1px solid var(--border,#f2f4f7)" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 700 }}>{aptName(a)}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b" }}>{svcName(a)}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b" }}>{a.stylistName ?? a.doctorFullName}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b", whiteSpace: "nowrap" }}>{fmtDateTime(a.startAtUtc)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <button onClick={() => { setEditAppt(a); setShowModal(true); }} className="btn btn-ghost" style={{ padding: "6px 12px", minHeight: 34, fontSize: 12 }}>
                        Düzenle
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : view === "day" ? (
        /* ── DAY VIEW ── */
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setDate(d => addDays(d, -1))} className="btn btn-ghost" style={{ padding: "6px 12px", minHeight: 36 }}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              {DAYS[date.getDay()]}, {date.getDate()} {MONTHS[date.getMonth()]} {date.getFullYear()}
            </span>
            <button onClick={() => setDate(d => addDays(d, 1))} className="btn btn-ghost" style={{ padding: "6px 12px", minHeight: 36 }}>›</button>
            <button onClick={() => setDate(new Date())} className="btn btn-ghost" style={{ padding: "6px 12px", minHeight: 36, fontSize: 12 }}>Bugün</button>
          </div>
          <div style={{ display: "flex", overflowX: "auto" }}>
            <div style={{ width: 56, flexShrink: 0, paddingTop: 0, borderRight: "1px solid var(--border,#f2f4f7)" }}>
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                <div key={i} style={{ height: HOUR_H, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 8, paddingTop: 4 }}>
                  <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{String(HOUR_START + i).padStart(2,"0")}:00</span>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, position: "relative", height: GRID_H, cursor: "crosshair", minWidth: 200 }}
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const mins = Math.floor(Math.floor(y / HOUR_H * 60) / 15) * 15;
                const localMins = HOUR_START * 60 + mins;
                const pad = (n: number) => String(n).padStart(2, "0");
                const ds = isoDate(date);
                const startUtc = localToUtc(`${ds}T${pad(Math.floor(localMins/60))}:${pad(localMins%60)}`);
                const endUtc   = localToUtc(`${ds}T${pad(Math.floor((localMins+30)/60))}:${pad((localMins+30)%60)}`);
                setEditAppt({ id: "", startAtUtc: startUtc, endAtUtc: endUtc, status: "Scheduled" });
                setShowModal(true);
              }}>
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                <div key={i} style={{ position: "absolute", left: 0, right: 0, top: i * HOUR_H, height: HOUR_H, borderTop: "1px solid #f2f4f7" }} />
              ))}
              {appts.map(a => {
                const st = STATUSES[a.status] ?? STATUSES.Scheduled;
                const top = apptTop(a.startAtUtc);
                const h   = apptHeight(a.startAtUtc, a.endAtUtc);
                return (
                  <div key={a.id} onClick={e => { e.stopPropagation(); setEditAppt(a); setShowModal(true); }} style={{
                    position: "absolute", left: 4, right: 4, top, height: h,
                    background: st.bg, borderLeft: `3px solid ${st.bar}`,
                    borderRadius: "0 6px 6px 0", padding: "4px 8px", overflow: "hidden",
                    cursor: "pointer", zIndex: 2, boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: st.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {fmtTime(a.startAtUtc)} · {aptName(a)}
                    </div>
                    {h >= 36 && <div style={{ fontSize: 11, color: st.color, opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{svcName(a)}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ── WEEK VIEW ── */
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border,#eaecf0)" }}>
            <button onClick={() => setDate(d => addDays(d, -7))} className="btn btn-ghost" style={{ padding: "6px 12px", minHeight: 36 }}>‹</button>
            <span style={{ fontWeight: 700 }}>
              {weekDays[0].getDate()} {MONTHS[weekDays[0].getMonth()]} – {weekDays[6].getDate()} {MONTHS[weekDays[6].getMonth()]} {weekDays[6].getFullYear()}
            </span>
            <button onClick={() => setDate(d => addDays(d, 7))} className="btn btn-ghost" style={{ padding: "6px 12px", minHeight: 36 }}>›</button>
            <button onClick={() => setDate(new Date())} className="btn btn-ghost" style={{ padding: "6px 12px", minHeight: 36, fontSize: 12 }}>Bugün</button>
          </div>
          <div style={{ display: "flex", overflowX: "auto" }}>
            <div style={{ width: 56, flexShrink: 0, paddingTop: 40, borderRight: "1px solid var(--border,#f2f4f7)" }}>
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                <div key={i} style={{ height: HOUR_H, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 8, paddingTop: 4 }}>
                  <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{String(HOUR_START + i).padStart(2,"0")}:00</span>
                </div>
              ))}
            </div>
            {weekDays.map(day => {
              const ds = isoDate(day);
              const dayAppts = appts.filter(a => a.startAtUtc.slice(0, 10) === ds);
              const isToday = ds === isoDate(new Date());
              return (
                <div key={ds} style={{ flex: 1, minWidth: 100, borderRight: "1px solid var(--border,#f2f4f7)" }}>
                  <div style={{
                    height: 40, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    borderBottom: "1px solid var(--border,#eaecf0)",
                    background: isToday ? "#ede9fe" : "transparent",
                  }}>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{DAYS[day.getDay()]}</div>
                    <div style={{ fontSize: 13, fontWeight: isToday ? 800 : 600, color: isToday ? "#7c3aed" : "var(--text,#101828)" }}>{day.getDate()}</div>
                  </div>
                  <div style={{ position: "relative", height: GRID_H }}>
                    {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                      <div key={i} style={{ position: "absolute", left: 0, right: 0, top: i * HOUR_H, height: HOUR_H, borderTop: "1px solid #f2f4f7" }} />
                    ))}
                    {dayAppts.map(a => {
                      const st = STATUSES[a.status] ?? STATUSES.Scheduled;
                      const top = apptTop(a.startAtUtc);
                      const h   = apptHeight(a.startAtUtc, a.endAtUtc);
                      return (
                        <div key={a.id} onClick={() => { setEditAppt(a); setShowModal(true); }} style={{
                          position: "absolute", left: 2, right: 2, top, height: h,
                          background: st.bg, borderLeft: `3px solid ${st.bar}`,
                          borderRadius: "0 4px 4px 0", padding: "2px 4px", overflow: "hidden",
                          cursor: "pointer", zIndex: 2,
                        }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: st.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {fmtTime(a.startAtUtc)} {aptName(a)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showModal && (
        <ApptModal
          appt={editAppt}
          customers={customers}
          stylists={stylists}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </AppShell>
  );
}

/* ── Appointment Modal ─────────────────────────────────────────── */
function ApptModal({
  appt, customers, stylists, onClose, onSaved,
}: {
  appt: Appt | null;
  customers: Customer[];
  stylists: Stylist[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!(appt?.id);

  function toLocalStr(utc: string) {
    if (!utc) return "";
    const d = new Date(utc);
    const off = 180 * 60 * 1000;
    const loc = new Date(d.getTime() + off);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${loc.getUTCFullYear()}-${p(loc.getUTCMonth()+1)}-${p(loc.getUTCDate())}T${p(loc.getUTCHours())}:${p(loc.getUTCMinutes())}`;
  }

  const [customerId, setCustomerId]   = useState(appt ? (appt as { customerId?: string }).customerId ?? "" : "");
  const [stylistId,  setStylistId]    = useState(appt ? (appt as { stylistId?: string; doctorId?: string }).stylistId ?? (appt as { doctorId?: string }).doctorId ?? "" : "");
  const [service,    setService]      = useState(appt?.serviceName ?? appt?.procedureName ?? "");
  const [start,      setStart]        = useState(appt?.startAtUtc ? toLocalStr(appt.startAtUtc) : "");
  const [end,        setEnd]          = useState(appt?.endAtUtc ? toLocalStr(appt.endAtUtc) : "");
  const [status,     setStatus]       = useState(appt?.status ?? "Scheduled");
  const [notes,      setNotes]        = useState(appt?.notes ?? "");
  const [saving,     setSaving]       = useState(false);
  const [error,      setError]        = useState("");

  const save = async () => {
    if (!customerId) { setError("Müşteri seçiniz."); return; }
    if (!service)    { setError("Hizmet adı giriniz."); return; }
    if (!start)      { setError("Başlangıç saati giriniz."); return; }
    setSaving(true);
    try {
      const body = {
        customerId, stylistId, serviceName: service, notes,
        status,
        startAtUtc: localToUtc(start),
        endAtUtc:   end ? localToUtc(end) : localToUtc(start),
      };
      const res = isEdit
        ? await apiFetch(`/Appointments/${appt!.id}`, { method: "PUT", body: JSON.stringify(body) })
        : await apiFetch("/Appointments", { method: "POST", body: JSON.stringify(body) });
      if (res.ok) onSaved();
      else { const d = await res.json().catch(() => ({})); setError(d.message ?? "Kayıt hatası"); }
    } finally { setSaving(false); }
  };

  const s: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: 10, minHeight: 44,
    border: "1px solid var(--border,#d0d5dd)", fontSize: 14,
    background: "var(--surface,#fff)", color: "var(--text,#101828)",
    WebkitAppearance: "none",
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, backdropFilter: "blur(3px)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(480px, 94vw)", zIndex: 301, maxHeight: "92vh", overflowY: "auto",
        background: "var(--surface,#fff)", borderRadius: 20,
        boxShadow: "0 24px 64px rgba(15,23,42,0.22)", border: "1px solid var(--border,#eaecf0)",
      }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{isEdit ? "Randevu Düzenle" : "Yeni Randevu"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Müşteri *</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={s}>
              <option value="">Müşteri seçiniz...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Stilist</label>
            <select value={stylistId} onChange={e => setStylistId(e.target.value)} style={s}>
              <option value="">Stilist seçiniz...</option>
              {stylists.map(st => <option key={st.id} value={st.id}>{st.fullName}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Hizmet *</label>
            <input value={service} onChange={e => setService(e.target.value)} placeholder="Saç kesimi, boya, bakım..." style={s} />
          </div>
          <div className="form-grid">
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Başlangıç *</label>
              <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} style={s} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Bitiş</label>
              <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} style={s} />
            </div>
          </div>
          {isEdit && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Durum</label>
              <select value={status} onChange={e => setStatus(e.target.value)} style={s}>
                {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Notlar</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...s, resize: "vertical" }} placeholder="İsteğe bağlı not..." />
          </div>
          {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", color: "#b42318", fontSize: 13, fontWeight: 600 }}>⚠ {error}</div>}
          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>İptal</button>
            <button onClick={save} disabled={saving} className="btn btn-primary" style={{ flex: 2, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Randevu Oluştur"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
