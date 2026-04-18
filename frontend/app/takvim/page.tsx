"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { useIsMobile } from "@/hooks/useIsMobile";
import { fmtTime, toIstMins, localToUtc } from "@/lib/tz";

/* ── Types ──────────────────────────────────────────────────────── */
type Stylist = { id: string; fullName: string; specialty?: string };
type Slot    = { startUtc: string; endUtc: string; available: boolean };
type Appt    = {
  id: string; customerFullName?: string; patientFullName?: string;
  serviceName?: string; procedureName?: string;
  startAtUtc: string; endAtUtc: string; status: string;
  stylistFullName?: string; doctorFullName?: string;
};
type Col     = { stylist: Stylist; slots: Slot[]; appts: Appt[] };

/* ── Constants ──────────────────────────────────────────────────── */
const HOUR_START  = 7;
const HOUR_END    = 21;
const HOUR_H      = 72;
const GRID_H      = (HOUR_END - HOUR_START) * HOUR_H;
const DAY_LABELS  = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
const MONTH_SHORT = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

const STATUS: Record<string, { bg: string; color: string; bar: string }> = {
  Scheduled: { bg: "#ede9fe", color: "#7c3aed", bar: "#7c3aed" },
  Completed: { bg: "#dcfce7", color: "#166534", bar: "#22c55e" },
  Cancelled: { bg: "#fee2e2", color: "#991b1b", bar: "#ef4444" },
  NoShow:    { bg: "#fef3c7", color: "#92400e", bar: "#f59e0b" },
};

const STYLIST_COLORS = [
  "#7c3aed","#0ea5e9","#ec4899","#f59e0b","#10b981","#ef4444","#06b6d4","#84cc16",
];

/* ── Helpers ─────────────────────────────────────────────────────── */
function apptTop(utc: string)  { return Math.max(0, (toIstMins(utc) - HOUR_START * 60) * (HOUR_H / 60)); }
function apptHeight(s: string, e: string) {
  const diff = (new Date(e).getTime() - new Date(s).getTime()) / 60000;
  return Math.max(HOUR_H / 3, diff * (HOUR_H / 60));
}
function fmtDate(d: Date) { return `${DAY_LABELS[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`; }
function isoDate(d: Date) { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

/* ── Page ───────────────────────────────────────────────────────── */
export default function TakvimPage() {
  const [date,         setDate]         = useState(() => new Date());
  const [stylists,     setStylists]     = useState<Stylist[]>([]);
  const [cols,         setCols]         = useState<Col[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [selStylists,  setSelStylists]  = useState<Set<string>>(new Set());
  const [view,         setView]         = useState<"day"|"agenda">("day");
  const [modal,        setModal]        = useState<{ stylistId: string; startUtc: string; endUtc: string } | null>(null);
  const [activeMobIdx, setActiveMobIdx] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    apiFetch("/Stylists?activeOnly=true")
      .then(r => r.ok ? r.json() : [])
      .then((d: Stylist[]) => {
        setStylists(d);
        setSelStylists(new Set(d.slice(0, 6).map(x => x.id)));
      });
  }, []);

  const loadDay = useCallback(async () => {
    const visible = stylists.filter(s => selStylists.has(s.id));
    if (!visible.length) { setCols([]); return; }
    setLoading(true);
    const ds = isoDate(date);
    const dayStart = `${ds}T00:00:00Z`;
    const dayEnd   = `${ds}T23:59:59Z`;
    try {
      const results = await Promise.all(
        visible.map(async stylist => {
          const [sR, aR] = await Promise.all([
            apiFetch(`/StylistSchedule/${stylist.id}/slots?date=${ds}&tzOffsetMinutes=180`),
            apiFetch(`/Appointments?stylistId=${stylist.id}&start=${encodeURIComponent(dayStart)}&end=${encodeURIComponent(dayEnd)}`),
          ]);
          return {
            stylist,
            slots:  sR.ok ? await sR.json() as Slot[] : [],
            appts:  aR.ok ? await aR.json() as Appt[] : [],
          };
        })
      );
      setCols(results);
    } finally { setLoading(false); }
  }, [date, stylists, selStylists]);

  useEffect(() => { loadDay(); }, [loadDay]);

  const toggleStylist = (id: string) => {
    setSelStylists(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isToday      = isoDate(date) === isoDate(new Date());
  const visibleCols  = cols.filter(c => selStylists.has(c.stylist.id));

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>, stylistId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minsFromStart = Math.floor(y / HOUR_H * 60);
    const snapped = Math.floor(minsFromStart / 15) * 15;
    const localMins = HOUR_START * 60 + snapped;
    const endLocalMins = Math.min(localMins + 30, HOUR_END * 60);
    const ds  = isoDate(date);
    const pad = (n: number) => String(n).padStart(2, "0");
    const startUtc = localToUtc(`${ds}T${pad(Math.floor(localMins / 60))}:${pad(localMins % 60)}`);
    const endUtc   = localToUtc(`${ds}T${pad(Math.floor(endLocalMins / 60))}:${pad(endLocalMins % 60)}`);
    setModal({ stylistId, startUtc, endUtc });
  };

  const allAppts: (Appt & { stylist: Stylist; color: string })[] = cols
    .flatMap((c, ci) => c.appts.map(a => ({ ...a, stylist: c.stylist, color: STYLIST_COLORS[ci % STYLIST_COLORS.length] })))
    .sort((a, b) => new Date(a.startAtUtc).getTime() - new Date(b.startAtUtc).getTime());

  const navBtn: React.CSSProperties = {
    width: 40, height: 40, borderRadius: 10, border: "1px solid var(--border,#e4e7ec)",
    background: "var(--surface,#fff)", color: "var(--text,#344054)",
    cursor: "pointer", fontSize: 18, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  };

  return (
    <AppShell title="Çalışma Takvimi" description="Günlük program ve randevu görünümü">

      {/* Toolbar */}
      <div style={{ background: "var(--surface,#fff)", borderRadius: 16, border: "1px solid var(--border,#eaecf0)", padding: "14px 16px", marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setDate(d => addDays(d, -1))} style={navBtn}>‹</button>
          <div style={{ minWidth: 190, textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text,#101828)" }}>{fmtDate(date)}</div>
            {isToday && <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700 }}>Bugün</div>}
          </div>
          <button onClick={() => setDate(d => addDays(d, 1))} style={navBtn}>›</button>
          {!isToday && (
            <button onClick={() => setDate(new Date())} style={{ ...navBtn, fontSize: 12, padding: "6px 14px", width: "auto", fontWeight: 700, color: "#7c3aed", borderColor: "#c4b5fd", background: "#ede9fe" }}>
              Bugün
            </button>
          )}
          <input
            type="date"
            value={isoDate(date)}
            onChange={e => { if (e.target.value) setDate(new Date(e.target.value + "T12:00:00")); }}
            style={{ minHeight: 40, padding: "6px 10px", borderRadius: 10, border: "1px solid var(--border,#d0d5dd)", fontSize: 13, background: "var(--surface,#fff)", color: "var(--text,#101828)", cursor: "pointer" }}
          />
        </div>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {(["day","agenda"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              ...navBtn, fontSize: 13, padding: "8px 16px", width: "auto", fontWeight: 700,
              background: view === v ? "#7c3aed" : "var(--surface,#fff)",
              color:      view === v ? "#fff"    : "#64748b",
              borderColor: view === v ? "#7c3aed" : "var(--border,#e2e8f0)",
            }}>
              {v === "day" ? "◫ Gün" : "☰ Ajanda"}
            </button>
          ))}
        </div>
      </div>

      {/* Stylist filter pills */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {stylists.map((stylist, ci) => {
          const active = selStylists.has(stylist.id);
          const color  = STYLIST_COLORS[ci % STYLIST_COLORS.length];
          return (
            <button key={stylist.id} onClick={() => toggleStylist(stylist.id)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 999, border: `2px solid ${active ? color : "var(--border,#e2e8f0)"}`,
              background: active ? color + "18" : "var(--surface,#fff)",
              color: active ? color : "#64748b",
              fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.15s", minHeight: 40,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: active ? color : "#d1d5db", flexShrink: 0 }} />
              {stylist.fullName}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          Yükleniyor...
        </div>
      ) : visibleCols.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", background: "var(--surface,#fff)", borderRadius: 16, border: "1px solid var(--border,#eaecf0)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Stilist seçilmedi</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Yukarıdan stilist seçerek programı görüntüleyin.</div>
        </div>
      ) : view === "agenda" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {allAppts.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", background: "var(--surface,#fff)", borderRadius: 16, border: "1px solid var(--border,#eaecf0)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
              <div style={{ fontWeight: 700 }}>Bu gün randevu yok</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Seçili stilistlerin programı boş.</div>
            </div>
          ) : allAppts.map(a => {
            const st = STATUS[a.status] ?? STATUS.Scheduled;
            const customerName = a.customerFullName ?? a.patientFullName ?? "?";
            const svcName = a.serviceName ?? a.procedureName ?? "";
            const stylistName = a.stylist.fullName;
            return (
              <div key={a.id} style={{ background: "var(--surface,#fff)", borderRadius: 14, border: "1px solid var(--border,#eaecf0)", display: "flex", alignItems: "stretch", overflow: "hidden" }}>
                <div style={{ width: 4, background: a.color, flexShrink: 0 }} />
                <div style={{ flex: 1, padding: "14px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 90, textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text,#101828)" }}>{fmtTime(a.startAtUtc)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>→ {fmtTime(a.endAtUtc)}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                      {Math.round((new Date(a.endAtUtc).getTime() - new Date(a.startAtUtc).getTime()) / 60000)} dk
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text,#101828)" }}>{customerName}</div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>✂️ {svcName} · {stylistName}</div>
                  </div>
                  <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: st.bg, color: st.color }}>
                    {a.status === "Scheduled" ? "Planlandı" : a.status === "Completed" ? "Tamamlandı" : a.status === "Cancelled" ? "İptal" : "Gelmedi"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          {/* Mobile: stylist tab switcher */}
          {visibleCols.length > 1 && (
            <div className="mobile-only" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
              {visibleCols.map((c, i) => (
                <button key={c.stylist.id} onClick={() => setActiveMobIdx(i)} style={{
                  flexShrink: 0, padding: "8px 14px", borderRadius: 999,
                  border: `2px solid ${activeMobIdx === i ? STYLIST_COLORS[i % STYLIST_COLORS.length] : "var(--border,#e2e8f0)"}`,
                  background: activeMobIdx === i ? STYLIST_COLORS[i % STYLIST_COLORS.length] + "18" : "var(--surface,#fff)",
                  color: activeMobIdx === i ? STYLIST_COLORS[i % STYLIST_COLORS.length] : "#64748b",
                  fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", minHeight: 40,
                }}>
                  {c.stylist.fullName}
                </button>
              ))}
            </div>
          )}
          <div style={{ background: "var(--surface,#fff)", borderRadius: 16, border: "1px solid var(--border,#eaecf0)", overflow: "hidden" }}>
            <div style={{ display: "flex", overflowX: "auto" }}>
              {/* Time axis */}
              <div style={{ width: 56, flexShrink: 0, borderRight: "1px solid var(--border,#f2f4f7)", paddingTop: 52 }}>
                {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                  <div key={i} style={{ height: HOUR_H, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 8, paddingTop: 4 }}>
                    <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {String(HOUR_START + i).padStart(2, "0")}:00
                    </span>
                  </div>
                ))}
              </div>
              {/* Stylist columns */}
              {visibleCols.map((col, ci) => {
                const color = STYLIST_COLORS[ci % STYLIST_COLORS.length];
                return (
                  <div key={col.stylist.id} style={{ flex: 1, minWidth: 160, borderRight: "1px solid var(--border,#f2f4f7)", display: (!isMobile || ci === activeMobIdx) ? "block" : "none" }}>
                    <div style={{ height: 52, padding: "8px 12px", borderBottom: `3px solid ${color}`, background: color + "10", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text,#101828)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {col.stylist.fullName}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                        {col.slots.filter(s => s.available).length > 0
                          ? <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ {col.slots.filter(s => s.available).length} müsait</span>
                          : <span style={{ color: "#94a3b8" }}>Program yok</span>
                        }
                      </div>
                    </div>
                    <div style={{ position: "relative", height: GRID_H, cursor: "crosshair" }} onClick={e => handleTimelineClick(e, col.stylist.id)}>
                      {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                        <div key={i} style={{ position: "absolute", left: 0, right: 0, top: i * HOUR_H, height: HOUR_H, borderTop: "1px solid #f2f4f7", background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.01)" }} />
                      ))}
                      {col.slots.filter(s => s.available).map((slot, si) => {
                        const top = apptTop(slot.startUtc);
                        const h   = apptHeight(slot.startUtc, slot.endUtc);
                        return (
                          <div key={si}
                            onClick={e => { e.stopPropagation(); setModal({ stylistId: col.stylist.id, startUtc: slot.startUtc, endUtc: slot.endUtc }); }}
                            style={{ position: "absolute", left: 3, right: 3, top, height: h, background: color + "0d", border: `1px dashed ${color}55`, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                            onMouseEnter={e => (e.currentTarget.style.background = color + "22")}
                            onMouseLeave={e => (e.currentTarget.style.background = color + "0d")}>
                            <span style={{ fontSize: 9, color, fontWeight: 800, letterSpacing: "0.5px" }}>+ EKLE</span>
                          </div>
                        );
                      })}
                      {col.appts.map(appt => {
                        const st  = STATUS[appt.status] ?? STATUS.Scheduled;
                        const top = apptTop(appt.startAtUtc);
                        const h   = apptHeight(appt.startAtUtc, appt.endAtUtc);
                        const dur = Math.round((new Date(appt.endAtUtc).getTime() - new Date(appt.startAtUtc).getTime()) / 60000);
                        const custName = appt.customerFullName ?? appt.patientFullName ?? "?";
                        return (
                          <div key={appt.id} onClick={e => e.stopPropagation()} style={{ position: "absolute", left: 4, right: 4, top, height: h, background: st.bg, borderLeft: `3px solid ${st.bar}`, borderRadius: "0 6px 6px 0", padding: "4px 8px", overflow: "hidden", cursor: "pointer", zIndex: 2, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: st.color, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {fmtTime(appt.startAtUtc)} · {custName}
                            </div>
                            {h >= 36 && (
                              <div style={{ fontSize: 11, color: st.color, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {appt.serviceName ?? appt.procedureName}
                              </div>
                            )}
                            {h >= 52 && <div style={{ fontSize: 10, color: st.color, opacity: 0.55, marginTop: 2 }}>{dur} dk</div>}
                          </div>
                        );
                      })}
                      {col.slots.length === 0 && col.appts.length === 0 && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, pointerEvents: "none" }}>
                          <div style={{ fontSize: 24, opacity: 0.15 }}>◷</div>
                          <div style={{ fontSize: 11, color: "#d1d5db", textAlign: "center" }}>Bu gün<br/>program yok</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {modal && (
        <QuickModal
          stylistId={modal.stylistId}
          stylistName={stylists.find(s => s.id === modal.stylistId)?.fullName ?? ""}
          startUtc={modal.startUtc}
          endUtc={modal.endUtc}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadDay(); }}
        />
      )}
    </AppShell>
  );
}

/* ── Quick Appointment Modal ────────────────────────────────────── */
function QuickModal({ stylistId, stylistName, startUtc, endUtc, onClose, onSaved }: {
  stylistId: string; stylistName: string;
  startUtc: string; endUtc: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [customers,   setCustomers]   = useState<{ id: string; fullName: string }[]>([]);
  const [customerId,  setCustomerId]  = useState("");
  const [service,     setService]     = useState("");
  const [notes,       setNotes]       = useState("");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");

  useEffect(() => {
    apiFetch("/Customers?pageSize=200").then(r => r.ok ? r.json() : []).then((d: { id: string; firstName: string; lastName: string }[]) =>
      setCustomers(d.map(c => ({ id: c.id, fullName: `${c.firstName} ${c.lastName}` })))
    );
  }, []);

  const save = async () => {
    if (!customerId) { setError("Müşteri seçiniz."); return; }
    if (!service)    { setError("Hizmet adı giriniz."); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/Appointments", {
        method: "POST",
        body: JSON.stringify({ customerId, stylistId, serviceName: service, notes, startAtUtc: startUtc, endAtUtc: endUtc }),
      });
      if (res.ok) onSaved();
      else { const d = await res.json().catch(() => ({})); setError(d.message ?? "Kayıt hatası."); }
    } finally { setSaving(false); }
  };

  const s: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 10, minHeight: 48, border: "1px solid var(--border,#d0d5dd)", fontSize: 15, background: "var(--surface,#fff)", color: "var(--text,#101828)", WebkitAppearance: "none" };
  const dur = Math.round((new Date(endUtc).getTime() - new Date(startUtc).getTime()) / 60000);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 100, backdropFilter: "blur(3px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(460px, 94vw)", zIndex: 101, maxHeight: "90vh", overflowY: "auto", background: "var(--surface,#fff)", borderRadius: 20, boxShadow: "0 24px 64px rgba(15,23,42,0.25)", border: "1px solid var(--border,#eaecf0)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Hızlı Randevu</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>
              ✂️ {stylistName}
              <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 6, background: "#ede9fe", color: "#7c3aed", fontSize: 12, fontWeight: 700 }}>
                {fmtTime(startUtc)} – {fmtTime(endUtc)} ({dur} dk)
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8", lineHeight: 1, padding: 4 }}>×</button>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Müşteri *</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={s}>
              <option value="">Müşteri seçiniz...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Hizmet *</label>
            <input value={service} onChange={e => setService(e.target.value)} placeholder="Saç kesimi, boya, bakım..." style={s} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Notlar</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="İsteğe bağlı..." style={{ ...s, resize: "vertical" }} />
          </div>
          {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", color: "#b42318", fontSize: 13, fontWeight: 600 }}>⚠ {error}</div>}
          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>İptal</button>
            <button onClick={save} disabled={saving} className="btn btn-primary" style={{ flex: 2, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Kaydediliyor..." : "Randevu Oluştur"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
