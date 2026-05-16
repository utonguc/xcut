"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { fmtTime, fmtDateTime, toIstMins, localToUtc } from "@/lib/tz";

/* ── Types ─────────────────────────────────────────────────────── */
type Customer = { id: string; firstName: string; lastName: string };
type Stylist  = { id: string; fullName: string; branch?: string };
type Service  = { id: string; name: string; category: string; price: number; durationMinutes: number };
type ApptReq  = {
  id: string;
  stylistName: string;
  requestedStartUtc: string;
  requestedEndUtc: string;
  serviceName: string;
  customerFirstName: string;
  customerLastName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerNotes?: string;
  status: string;
  rejectionReason?: string;
  createdAtUtc: string;
};
type Appt     = {
  id: string;
  customerId?: string;       stylistId?: string;
  customerFullName?: string; stylistFullName?: string;
  customerName?: string;     patientFullName?: string;  // eclinic compat
  serviceName?: string;      procedureName?: string;
  doctorFullName?: string;   // eclinic compat
  startAtUtc: string; endAtUtc: string; status: string;
  notes?: string;
};

/* ── Constants ──────────────────────────────────────────────────── */
const HOUR_START = 7;
const HOUR_END   = 21;
const HOUR_H     = 64;
const GRID_H     = (HOUR_END - HOUR_START) * HOUR_H;

const STATUSES: Record<string, { bg: string; color: string; bar: string; label: string; emoji: string }> = {
  Scheduled:  { bg: "#ede9fe", color: "#7c3aed", bar: "#7c3aed", label: "Planlandı",      emoji: "📅" },
  InProgress: { bg: "#dbeafe", color: "#1d4ed8", bar: "#3b82f6", label: "Devam Ediyor",   emoji: "▶" },
  Late:       { bg: "#fff7ed", color: "#c2410c", bar: "#f97316", label: "Gecikmeli",       emoji: "⏰" },
  Completed:  { bg: "#dcfce7", color: "#166534", bar: "#22c55e", label: "Tamamlandı",     emoji: "✓" },
  Cancelled:  { bg: "#fee2e2", color: "#991b1b", bar: "#ef4444", label: "İptal",           emoji: "✕" },
  NoShow:     { bg: "#fef3c7", color: "#92400e", bar: "#f59e0b", label: "Gelmedi",         emoji: "⚠" },
};

function isOverdue(a: { status: string; endAtUtc: string }) {
  return a.status === "Scheduled" && new Date(a.endAtUtc) < new Date();
}

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
  const router = useRouter();
  const { toast } = useToast();
  const [view,       setView]       = useState<"week"|"day"|"list"|"requests">("week");
  const [date,       setDate]       = useState(() => new Date());
  const [appts,      setAppts]      = useState<Appt[]>([]);
  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [stylists,   setStylists]   = useState<Stylist[]>([]);
  const [services,   setServices]   = useState<Service[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterStylist, setFilterStylist] = useState("");
  const [searchText, setSearchText] = useState("");
  const [showModal,  setShowModal]  = useState(false);
  const [editAppt,   setEditAppt]   = useState<Appt | null>(null);
  const [requests,   setRequests]   = useState<ApptReq[]>([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [rejectModal, setRejectModal] = useState<{ id: string; req: ApptReq } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [salonName, setSalonName] = useState("");

  useEffect(() => {
    apiFetch("/Customers?pageSize=200").then(r => r.ok ? r.json() : []).then(setCustomers);
    apiFetch("/Pos/init").then(r => r.ok ? r.json() : null).then(d => { if (d?.services) setServices(d.services); });
    Promise.all([
      apiFetch("/Stylists?activeOnly=true").then(r => r.ok ? r.json() : []) as Promise<Stylist[]>,
      apiFetch("/Auth/me").then(r => r.ok ? r.json() : null),
    ]).then(([all, me]) => {
      const filtered = (me?.isSelfOnly && me?.stylistId) ? all.filter((s: Stylist) => s.id === me.stylistId) : all;
      setStylists(filtered);
      if (me?.salonName) setSalonName(me.salonName);
    }).catch(() =>
      apiFetch("/Doctors?activeOnly=true").then(r => r.ok ? r.json() : []).then(setStylists)
    );
  }, []);

  const loadRequests = useCallback(async () => {
    setReqLoading(true);
    try {
      const r = await apiFetch("/AppointmentRequests");
      if (r.ok) {
        const all: ApptReq[] = await r.json();
        setRequests(all);
        setPendingCount(all.filter(x => x.status === "Pending").length);
      }
    } finally { setReqLoading(false); }
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const approveRequest = async (req: ApptReq) => {
    const r = await apiFetch(`/AppointmentRequests/${req.id}/review`, {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    });
    if (r.ok) {
      toast.success("Randevu onaylandı.");
      loadRequests();
      if (req.customerEmail) {
        fetch("/api/notify", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: "booking_status",
            to: req.customerEmail,
            subject: "Randevunuz Onaylandı",
            data: {
              status: "approved",
              salonName,
              stylistName: req.stylistName,
              serviceName: req.serviceName,
              startUtc: req.requestedStartUtc,
              customerFirstName: req.customerFirstName,
            },
          }),
        }).catch(() => {});
      }
    } else {
      const d = await r.json().catch(() => ({}));
      toast.error(d.message ?? "Onaylama başarısız.");
    }
  };

  const rejectRequest = async (req: ApptReq, reason: string) => {
    const r = await apiFetch(`/AppointmentRequests/${req.id}/review`, {
      method: "PATCH",
      body: JSON.stringify({ action: "reject", rejectionReason: reason }),
    });
    if (r.ok) {
      toast.success("Talep reddedildi.");
      setRejectModal(null); setRejectReason("");
      loadRequests();
      if (req.customerEmail) {
        fetch("/api/notify", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: "booking_status",
            to: req.customerEmail,
            subject: "Randevu Talebiniz Hakkında",
            data: {
              status: "rejected",
              salonName,
              stylistName: req.stylistName,
              serviceName: req.serviceName,
              startUtc: req.requestedStartUtc,
              customerFirstName: req.customerFirstName,
              rejectionReason: reason,
            },
          }),
        }).catch(() => {});
      }
    } else {
      const d = await r.json().catch(() => ({}));
      toast.error(d.message ?? "Red işlemi başarısız.");
    }
  };

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

  const aptName = (a: Appt) => a.customerFullName ?? a.customerName ?? a.patientFullName ?? "?";
  const svcName = (a: Appt) => a.serviceName ?? a.procedureName ?? "";
  const stName  = (a: Appt) => a.stylistFullName ?? a.doctorFullName ?? "";

  const filteredAppts = searchText.trim()
    ? appts.filter(a => {
        const q = searchText.toLowerCase();
        return aptName(a).toLowerCase().includes(q) || svcName(a).toLowerCase().includes(q) || stName(a).toLowerCase().includes(q);
      })
    : appts;

  const sendToKasa = async (a: Appt) => {
    const r = await apiFetch(`/Pos/from-appointment/${a.id}`);
    const prefill = r.ok ? await r.json() : null;
    localStorage.setItem("xcut_pos_prefill", JSON.stringify({
      stylistId:        prefill?.stylistId        ?? a.stylistId,
      customerId:       prefill?.customerId        ?? a.customerId,
      customerFullName: prefill?.customerFullName  ?? aptName(a),
      suggestedItems:   prefill?.suggestedItems    ?? (svcName(a) ? [{ name: svcName(a), unitPrice: 0, quantity: 1 }] : []),
    }));
    router.push("/kasa");
  };

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
          {(["week","day","list","requests"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`btn ${view === v ? "btn-primary" : "btn-ghost"}`} style={{ padding: "8px 14px", minHeight: 40, fontSize: 13, position: "relative" }}>
              {v === "week" ? "Hafta" : v === "day" ? "Gün" : v === "list" ? "Liste" : "Talepler"}
              {v === "requests" && pendingCount > 0 && (
                <span style={{ position: "absolute", top: 4, right: 4, background: "#ef4444", color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 800, padding: "1px 5px", lineHeight: 1.4 }}>{pendingCount}</span>
              )}
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

        <input
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Müşteri veya hizmet ara..."
          className="inp"
          style={{ width: 210, minHeight: 40 }}
        />

        <button onClick={load} className="btn btn-ghost" style={{ minHeight: 40, marginLeft: "auto" }}>🔄 Yenile</button>
      </div>

      {view !== "requests" && (loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
          Yükleniyor...
        </div>
      ) : view === "list" ? (
        /* ── LIST VIEW ── */
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--surface-2,#f8fafc)" }}>
                {["Müşteri","Hizmet","Stilist","Tarih/Saat","Durum","",""].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "#64748b", borderBottom: "1px solid var(--border,#eaecf0)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAppts.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>{searchText ? `"${searchText}" için randevu bulunamadı` : "Randevu bulunamadı"}</td></tr>
              )}
              {filteredAppts.map(a => {
                const overdue = isOverdue(a);
                const st = overdue
                  ? { ...STATUSES.Scheduled, bg: "#fff7ed", color: "#c2410c", bar: "#f97316", label: "Süresi Geçti", emoji: "⏰" }
                  : (STATUSES[a.status] ?? STATUSES.Scheduled);
                return (
                  <tr key={a.id} style={{ borderBottom: "1px solid var(--border,#f2f4f7)", background: overdue ? "#fffbf5" : undefined }}>
                    <td style={{ padding: "12px 16px", fontWeight: 700 }}>{aptName(a)}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b" }}>{svcName(a)}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b" }}>{stName(a)}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b", whiteSpace: "nowrap" }}>{fmtDateTime(a.startAtUtc)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span className="badge" style={{ background: st.bg, color: st.color }}>{st.emoji} {st.label}</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <button onClick={() => { setEditAppt(a); setShowModal(true); }} className="btn btn-ghost" style={{ padding: "6px 12px", minHeight: 34, fontSize: 12 }}>
                        Düzenle
                      </button>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {a.status === "Scheduled" && (
                        <button onClick={() => sendToKasa(a)} style={{ padding: "6px 12px", minHeight: 34, fontSize: 12, borderRadius: 8, border: "1px solid #e9d5ff", background: "#faf5ff", color: "#7c3aed", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                          🧾 Kasaya Aktar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
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
                const overdue = isOverdue(a);
                const st = overdue ? { ...STATUSES.Scheduled, bg: "#fff7ed", color: "#c2410c", bar: "#f97316" } : (STATUSES[a.status] ?? STATUSES.Scheduled);
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
                      {overdue && "⏰ "}{fmtTime(a.startAtUtc)} · {aptName(a)}
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
      ))}

      {view === "requests" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 2, padding: "12px 16px", borderBottom: "1px solid var(--border,#eaecf0)", background: "var(--surface-2,#f8fafc)" }}>
            {[["", "Tümü"], ["Pending", "Bekleyenler"], ["Approved", "Onaylananlar"], ["Rejected", "Reddedilenler"]].map(([k, lbl]) => (
              <button key={k} onClick={() => setFilterStatus(k)} className={`btn ${filterStatus === k ? "btn-primary" : "btn-ghost"}`} style={{ padding: "6px 14px", fontSize: 12, minHeight: 34 }}>
                {lbl}{k === "Pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
              </button>
            ))}
            <button onClick={loadRequests} className="btn btn-ghost" style={{ marginLeft: "auto", padding: "6px 12px", minHeight: 34, fontSize: 12 }}>🔄</button>
          </div>
          {reqLoading ? (
            <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>
              <div style={{ width: 28, height: 28, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
              Yükleniyor...
            </div>
          ) : (
            <div>
              {requests.filter(r => !filterStatus || r.status === filterStatus).length === 0 ? (
                <div style={{ padding: 48, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Kayıt bulunamadı</div>
              ) : requests.filter(r => !filterStatus || r.status === filterStatus).map(req => {
                const isPending  = req.status === "Pending";
                const isApproved = req.status === "Approved";
                const stCfg = isPending ? { bg: "#fef3c7", color: "#92400e", label: "Bekliyor" }
                            : isApproved ? { bg: "#dcfce7", color: "#166534", label: "Onaylandı" }
                            : { bg: "#fee2e2", color: "#991b1b", label: "Reddedildi" };
                return (
                  <div key={req.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--border,#f2f4f7)", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{req.customerFirstName} {req.customerLastName}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
                        {req.customerPhone && <span>{req.customerPhone} · </span>}
                        {req.customerEmail && <span>{req.customerEmail}</span>}
                      </div>
                      <div style={{ fontSize: 13, color: "#374151" }}>
                        <span style={{ fontWeight: 600 }}>{req.stylistName}</span> · {req.serviceName}
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{fmtDateTime(req.requestedStartUtc)}</div>
                      {req.customerNotes && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, fontStyle: "italic" }}>Not: {req.customerNotes}</div>}
                      {req.rejectionReason && <div style={{ fontSize: 12, color: "#991b1b", marginTop: 4 }}>Red nedeni: {req.rejectionReason}</div>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <span className="badge" style={{ background: stCfg.bg, color: stCfg.color }}>{stCfg.label}</span>
                      {isPending && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => approveRequest(req)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#dcfce7", color: "#166534", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✓ Onayla</button>
                          <button onClick={() => { setRejectModal({ id: req.id, req }); setRejectReason(""); }} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#fee2e2", color: "#991b1b", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✕ Reddet</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Reject reason modal */}
      {rejectModal && (
        <>
          <div onClick={() => setRejectModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 400 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(420px, 94vw)", zIndex: 401, background: "var(--surface,#fff)", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", border: "1px solid var(--border,#eaecf0)" }}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border,#eaecf0)", fontWeight: 800, fontSize: 16 }}>Talebi Reddet</div>
            <div style={{ padding: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Red Nedeni (isteğe bağlı)</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="Müşteriye iletilecek açıklama..." style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border,#d0d5dd)", fontSize: 14, resize: "vertical", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button onClick={() => setRejectModal(null)} className="btn btn-ghost" style={{ flex: 1 }}>İptal</button>
                <button onClick={() => rejectRequest(rejectModal.req, rejectReason)} style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Reddet</button>
              </div>
            </div>
          </div>
        </>
      )}

      {showModal && (
        <ApptModal
          appt={editAppt}
          customers={customers}
          stylists={stylists}
          services={services}
          appts={appts}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </AppShell>
  );
}

/* ── Appointment Modal ─────────────────────────────────────────── */
function ApptModal({
  appt, customers, stylists, services, appts, onClose, onSaved,
}: {
  appt: Appt | null;
  customers: Customer[];
  stylists: Stylist[];
  services: Service[];
  appts: Appt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, confirm } = useToast();
  const isEdit = !!(appt?.id);

  function toLocalStr(utc: string) {
    if (!utc) return "";
    const d = new Date(utc);
    const off = 180 * 60 * 1000;
    const loc = new Date(d.getTime() + off);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${loc.getUTCFullYear()}-${p(loc.getUTCMonth()+1)}-${p(loc.getUTCDate())}T${p(loc.getUTCHours())}:${p(loc.getUTCMinutes())}`;
  }

  const [customerId, setCustomerId] = useState(appt?.customerId ?? "");
  const [stylistId,  setStylistId]  = useState(appt?.stylistId ?? "");
  const [service,    setService]    = useState(appt?.serviceName ?? appt?.procedureName ?? "");
  const [start,      setStart]      = useState(appt?.startAtUtc ? toLocalStr(appt.startAtUtc) : "");
  const [end,        setEnd]        = useState(appt?.endAtUtc ? toLocalStr(appt.endAtUtc) : "");
  const [notes,      setNotes]      = useState(appt?.notes ?? "");
  const [saving,     setSaving]     = useState(false);
  const [acting,     setActing]     = useState(false);
  const [error,      setError]      = useState("");

  const currentStatus = appt?.status ?? "Scheduled";
  const isTerminal    = ["Completed", "Cancelled", "NoShow"].includes(currentStatus);

  /* subsequent Scheduled/Late appts for same stylist, after this appt's start */
  const nextAppts = isEdit && appt?.stylistId
    ? appts.filter(a =>
        a.id !== appt.id &&
        a.stylistId === appt.stylistId &&
        (a.status === "Scheduled" || a.status === "Late") &&
        new Date(a.startAtUtc) >= new Date(appt.startAtUtc)
      ).sort((a, b) => new Date(a.startAtUtc).getTime() - new Date(b.startAtUtc).getTime())
    : [];

  const save = async () => {
    if (!customerId) { setError("Müşteri seçiniz."); return; }
    if (!stylistId)  { setError("Stilist seçiniz."); return; }
    if (!service)    { setError("Hizmet adı giriniz."); return; }
    if (!start)      { setError("Başlangıç saati giriniz."); return; }
    setSaving(true);
    try {
      const body = {
        customerId, stylistId, serviceName: service, notes,
        status: currentStatus,
        startAtUtc: localToUtc(start),
        endAtUtc: (() => {
          if (end) return localToUtc(end);
          const dur = services.find(x => x.name === service)?.durationMinutes ?? 30;
          const d = new Date(new Date(start).getTime() + dur * 60000);
          const p = (n: number) => String(n).padStart(2, "0");
          return localToUtc(`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
        })(),
      };
      const res = isEdit
        ? await apiFetch(`/Appointments/${appt!.id}`, { method: "PUT", body: JSON.stringify(body) })
        : await apiFetch("/Appointments", { method: "POST", body: JSON.stringify(body) });
      if (res.ok) onSaved();
      else { const d = await res.json().catch(() => ({})); setError(d.message ?? "Kayıt hatası"); }
    } finally { setSaving(false); }
  };

  const quickStatus = async (s: string) => {
    if (!appt?.id) return;
    setActing(true);
    const res = await apiFetch(`/Appointments/${appt.id}/status`, { method: "PATCH", body: JSON.stringify({ status: s }) });
    setActing(false);
    if (res.ok) onSaved();
    else { const d = await res.json().catch(() => ({})); setError(d.message ?? "Durum güncellenemedi"); }
  };

  const extend = async (mins: number) => {
    if (!appt?.id) return;
    setActing(true);
    const res = await apiFetch(`/Appointments/${appt.id}/extend`, { method: "PATCH", body: JSON.stringify({ minutes: mins }) });
    setActing(false);
    if (res.ok) onSaved();
    else setError("Süre uzatılamadı");
  };

  const shiftSubsequent = async (mins: number) => {
    if (!appt?.stylistId || !appt?.startAtUtc) return;
    const ok = await confirm({ message: `Bu stilistin ${nextAppts.length} sonraki randevusu ${mins} dk kaydırılacak. Onaylıyor musunuz?` });
    if (!ok) return;
    setActing(true);
    const res = await apiFetch("/Appointments/shift-stylist", {
      method: "POST",
      body: JSON.stringify({ stylistId: appt.stylistId, afterUtc: appt.startAtUtc, shiftMinutes: mins }),
    });
    setActing(false);
    if (res.ok) { const d = await res.json(); onSaved(); toast.success(`${d.shifted} randevu ${mins} dk kaydırıldı.`); }
    else setError("Randevular kaydırılamadı");
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: 10, minHeight: 44,
    border: "1px solid var(--border,#d0d5dd)", fontSize: 14,
    background: "var(--surface,#fff)", color: "var(--text,#101828)",
    WebkitAppearance: "none", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: "#344054", display: "block",
    marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px",
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, backdropFilter: "blur(3px)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(500px, 96vw)", zIndex: 301, maxHeight: "92vh", overflowY: "auto",
        background: "var(--surface,#fff)", borderRadius: 20,
        boxShadow: "0 24px 64px rgba(15,23,42,0.22)", border: "1px solid var(--border,#eaecf0)",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{isEdit ? "Randevu Düzenle" : "Yeni Randevu"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}>×</button>
        </div>

        {/* ── Quick status bar (edit only) ── */}
        {isEdit && (
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>Hızlı Durum</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {([
                ["InProgress", "▶ Devam Ediyor", "#dbeafe", "#1d4ed8"],
                ["Late",       "⏰ Gecikmeli",   "#fff7ed", "#c2410c"],
                ["Completed",  "✓ Tamamlandı",  "#dcfce7", "#166534"],
                ["NoShow",     "⚠ Gelmedi",      "#fef3c7", "#92400e"],
                ["Cancelled",  "✕ İptal",         "#fee2e2", "#991b1b"],
              ] as [string, string, string, string][]).map(([st, lbl2, bg, color]) => (
                <button
                  key={st}
                  disabled={acting || currentStatus === st}
                  onClick={() => quickStatus(st)}
                  style={{
                    padding: "6px 12px", borderRadius: 8, border: `1px solid ${bg === "#fff" ? "#e2e8f0" : bg}`,
                    background: currentStatus === st ? bg : "#fff",
                    color: currentStatus === st ? color : "#64748b",
                    fontWeight: currentStatus === st ? 800 : 600, fontSize: 12, cursor: "pointer",
                    opacity: acting ? 0.6 : 1,
                  }}
                >{lbl2}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── Gecikme araçları (edit, non-terminal) ── */}
        {isEdit && !isTerminal && (
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border,#eaecf0)", background: "#fffbf5" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Gecikme Araçları</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Süre uzat:</span>
              {[15, 30, 45].map(m => (
                <button key={m} disabled={acting} onClick={() => extend(m)} style={{
                  padding: "5px 11px", borderRadius: 8, border: "1px solid #fed7aa",
                  background: "#fff7ed", color: "#c2410c", fontWeight: 700, fontSize: 12, cursor: "pointer",
                }}>+{m}dk</button>
              ))}
              {nextAppts.length > 0 && (
                <>
                  <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginLeft: 4 }}>
                    Sonraki {nextAppts.length} randevuyu kaydır:
                  </span>
                  {[15, 30].map(m => (
                    <button key={m} disabled={acting} onClick={() => shiftSubsequent(m)} style={{
                      padding: "5px 11px", borderRadius: 8, border: "1px solid #c7d2fe",
                      background: "#eef2ff", color: "#4338ca", fontWeight: 700, fontSize: 12, cursor: "pointer",
                    }}>+{m}dk ↓</button>
                  ))}
                </>
              )}
            </div>
            {nextAppts.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>
                {nextAppts.slice(0, 3).map(a => `${fmtTime(a.startAtUtc)} ${a.customerFullName ?? a.customerName ?? ""}`).join(" · ")}
                {nextAppts.length > 3 && ` +${nextAppts.length - 3} randevu daha`}
              </div>
            )}
          </div>
        )}

        {/* ── Form ── */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>Müşteri *</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={inp}>
              <option value="">Müşteri seçiniz...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Stilist *</label>
            <select value={stylistId} onChange={e => setStylistId(e.target.value)} style={inp}>
              <option value="">Stilist seçiniz...</option>
              {stylists.map(st => <option key={st.id} value={st.id}>{st.fullName}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Hizmet *</label>
            {services.length > 0 ? (
              <select
                value={service}
                onChange={e => {
                  setService(e.target.value);
                  const svc = services.find(x => x.name === e.target.value);
                  if (svc && svc.durationMinutes > 0 && start) {
                    const startMs = new Date(start).getTime();
                    const endMs   = startMs + svc.durationMinutes * 60 * 1000;
                    const d = new Date(endMs);
                    const p = (n: number) => String(n).padStart(2, "0");
                    setEnd(`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
                  }
                }}
                style={inp}
              >
                <option value="">Hizmet seçiniz...</option>
                {Array.from(new Set(services.map(x => x.category))).map(cat => (
                  <optgroup key={cat} label={cat}>
                    {services.filter(x => x.category === cat).map(svc => (
                      <option key={svc.id} value={svc.name}>
                        {svc.name}{svc.price > 0 ? ` — ₺${svc.price.toLocaleString("tr-TR")}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <input value={service} onChange={e => setService(e.target.value)} placeholder="Saç kesimi, boya, bakım..." style={inp} />
            )}
          </div>
          <div>
            <label style={lbl}>Başlangıç *</label>
            <input type="datetime-local" value={start} onChange={e => {
              const v = e.target.value;
              setStart(v);
              if (v) {
                const svc = services.find(x => x.name === service);
                const dur = svc?.durationMinutes ?? 30;
                const d = new Date(new Date(v).getTime() + dur * 60000);
                const p = (n: number) => String(n).padStart(2, "0");
                setEnd(`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
              }
            }} style={inp} />
          </div>
          <div>
            <label style={lbl}>Bitiş</label>
            <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Notlar</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} placeholder="İsteğe bağlı not..." />
          </div>
          {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", color: "#b42318", fontSize: 13, fontWeight: 600 }}>⚠ {error}</div>}
          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Kapat</button>
            {!isTerminal && (
              <button onClick={save} disabled={saving} className="btn btn-primary" style={{ flex: 2, opacity: saving ? 0.7 : 1 }}>
                {saving ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Randevu Oluştur"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
