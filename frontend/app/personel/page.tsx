"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────────── */
type Stylist = { id: string; fullName: string; payType: string; fixedSalary: number; commissionRate: number; isActive: boolean };
type AttendanceRow = { id: string; stylistId: string; status: string; date: string };
type Leave = { id: string; stylistId: string; stylistName: string; startDate: string; endDate: string; leaveType: string; reason?: string };
type Summary = { id: string; fullName: string; payType: string; fixedSalary: number; commissionRate: number; present: number; absent: number; leave: number; holiday: number; workingDays: number };

/* ── Constants ──────────────────────────────────────────────────────── */
const STATUS_LABELS: Record<string, string> = { present: "Var", absent: "Yok", leave: "İzin", holiday: "Tatil", official: "RT" };
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  present:  { bg: "#dcfce7", text: "#166534" },
  absent:   { bg: "#fee2e2", text: "#991b1b" },
  leave:    { bg: "#fef3c7", text: "#92400e" },
  holiday:  { bg: "#e0f2fe", text: "#075985" },
  official: { bg: "#ffedd5", text: "#7c2d12" },
};
const PAY_LABELS: Record<string, string> = {
  commission: "Prim", fixed_monthly: "Aylık Sabit", fixed_weekly: "Haftalık Sabit", fixed_daily: "Günlük"
};
const fmt   = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

const LEAVE_TYPES = [
  { value: "YillikIzin",     label: "Yıllık İzin",               color: "#166534", bg: "#dcfce7" },
  { value: "HaftaTatili",    label: "Hafta Tatili",               color: "#075985", bg: "#e0f2fe" },
  { value: "UlusalDini",     label: "Ulusal/Dini Bayram",         color: "#7c2d12", bg: "#ffedd5" },
  { value: "ResmiTatil",     label: "Resmi Tatil",                color: "#92400e", bg: "#fef3c7" },
  { value: "DogumIzni",      label: "Doğum İzni",                 color: "#be185d", bg: "#fce7f3" },
  { value: "GebelikKontrol", label: "Gebelik Kontrol İzni",       color: "#86198f", bg: "#fae8ff" },
  { value: "SutIzni",        label: "Süt İzni",                   color: "#0e7490", bg: "#cffafe" },
  { value: "Babalik",        label: "Babalık İzni",               color: "#065f46", bg: "#d1fae5" },
  { value: "OlumIzni",       label: "Ölüm İzni",                  color: "#374151", bg: "#f3f4f6" },
  { value: "YeniIsArama",    label: "Yeni İş Arama İzni",         color: "#713f12", bg: "#fefce8" },
  { value: "Evlilik",        label: "Evlilik İzni",               color: "#9f1239", bg: "#ffe4e6" },
  { value: "Mazeret",        label: "Mazeret İzni",               color: "#1d4ed8", bg: "#dbeafe" },
  { value: "Refakat",        label: "Refakat İzni",               color: "#5b21b6", bg: "#ede9fe" },
] as const;
type LeaveTypeValue = typeof LEAVE_TYPES[number]["value"];
const leaveTypeMap = Object.fromEntries(LEAVE_TYPES.map(t => [t.value, t])) as Record<string, typeof LEAVE_TYPES[number]>;

/* ── Turkish public holidays ────────────────────────────────────────── */
const TR_FIXED_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1,  day: 1,  name: "Yeni Yıl" },
  { month: 4,  day: 23, name: "Ulusal Egemenlik ve Çocuk Bayramı" },
  { month: 5,  day: 1,  name: "Emek ve Dayanışma Günü" },
  { month: 5,  day: 19, name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
  { month: 7,  day: 15, name: "Demokrasi ve Milli Birlik Günü" },
  { month: 8,  day: 30, name: "Zafer Bayramı" },
  { month: 10, day: 29, name: "Cumhuriyet Bayramı" },
];
const TR_RELIGIOUS_HOLIDAYS: { year: number; month: number; day: number; days: number; name: string }[] = [
  { year: 2025, month: 3,  day: 30, days: 3, name: "Ramazan Bayramı" },
  { year: 2025, month: 6,  day: 6,  days: 4, name: "Kurban Bayramı" },
  { year: 2026, month: 3,  day: 20, days: 3, name: "Ramazan Bayramı" },
  { year: 2026, month: 5,  day: 27, days: 4, name: "Kurban Bayramı" },
  { year: 2027, month: 3,  day: 9,  days: 3, name: "Ramazan Bayramı" },
  { year: 2027, month: 5,  day: 16, days: 4, name: "Kurban Bayramı" },
  { year: 2028, month: 2,  day: 26, days: 3, name: "Ramazan Bayramı" },
  { year: 2028, month: 5,  day: 5,  days: 4, name: "Kurban Bayramı" },
];

function getOfficialHolidays(year: number, month: number): Map<number, string> {
  const map = new Map<number, string>();
  TR_FIXED_HOLIDAYS.filter(h => h.month === month).forEach(h => map.set(h.day, h.name));
  TR_RELIGIOUS_HOLIDAYS
    .filter(h => h.year === year)
    .forEach(h => {
      for (let d = 0; d < h.days; d++) {
        const date = new Date(h.year, h.month - 1, h.day + d);
        if (date.getMonth() + 1 === month) map.set(date.getDate(), h.name);
      }
    });
  return map;
}

/* ── Helpers ────────────────────────────────────────────────────────── */
function leaveDayCount(startDate: string, endDate: string) {
  const s = new Date(startDate), e = new Date(endDate);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function toCSV(rows: string[][]): string {
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function PersonelPage() {
  const now = new Date();
  const [tab,        setTab]        = useState<"puantaj" | "izinler" | "ozet">("puantaj");
  const [year,       setYear]       = useState(now.getFullYear());
  const [month,      setMonth]      = useState(now.getMonth() + 1);
  const [stylists,   setStylists]   = useState<Stylist[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [leaves,     setLeaves]     = useState<Leave[]>([]);
  const [summary,    setSummary]    = useState<Summary[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);

  // Leave form state
  const [leaveForm, setLeaveForm] = useState({
    stylistId: "", leaveType: "YillikIzin" as LeaveTypeValue,
    startDate: "", endDate: "", note: "",
  });
  const [leaveError,  setLeaveError]  = useState("");
  const [leaveSaving, setLeaveSaving] = useState(false);

  const daysInMonth   = new Date(year, month, 0).getDate();
  const days          = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const officialDays  = getOfficialHolidays(year, month);
  const isSunday      = (d: number) => new Date(year, month - 1, d).getDay() === 0;
  const isOfficialDay = (d: number) => officialDays.has(d);

  /* ── Load ──────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    const [sRes, aRes, lRes, sumRes] = await Promise.all([
      apiFetch("/Stylists?isActive=true"),
      apiFetch(`/Personel/attendance?year=${year}&month=${month}`),
      apiFetch("/Personel/leaves"),
      apiFetch(`/Personel/summary?year=${year}&month=${month}`),
    ]);
    if (sRes.ok)   setStylists(await sRes.json());
    if (aRes.ok)   setAttendance(await aRes.json());
    if (lRes.ok)   setLeaves(await lRes.json());
    if (sumRes.ok) setSummary(await sumRes.json());
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  /* ── Attendance ─────────────────────────────────────────────────── */
  const getCell = (stylistId: string, day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return attendance.find(a => a.stylistId === stylistId && a.date === dateStr);
  };

  const toggleCell = async (stylistId: string, day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const current = attendance.find(a => a.stylistId === stylistId && a.date === dateStr);
    const statuses = ["present", "absent", "leave", "holiday"];
    const nextStatus = current ? statuses[(statuses.indexOf(current.status) + 1) % statuses.length] : "present";

    setSaving(true);
    const r = await apiFetch("/Personel/attendance", {
      method: "PUT",
      body: JSON.stringify({ stylistId, date: dateStr, status: nextStatus }),
    });
    if (r.ok) {
      setAttendance(prev => [
        ...prev.filter(a => !(a.stylistId === stylistId && a.date === dateStr)),
        { id: "", stylistId, status: nextStatus, date: dateStr },
      ]);
    }
    setSaving(false);
  };

  /* ── Leave CRUD ─────────────────────────────────────────────────── */
  const addLeave = async () => {
    setLeaveError("");
    if (!leaveForm.stylistId) { setLeaveError("Personel seçin."); return; }
    if (!leaveForm.startDate || !leaveForm.endDate) { setLeaveError("Tarihler zorunlu."); return; }
    setLeaveSaving(true);
    const r = await apiFetch("/Personel/leaves", {
      method: "POST",
      body: JSON.stringify({
        stylistId: leaveForm.stylistId,
        startDate: leaveForm.startDate,
        endDate:   leaveForm.endDate,
        leaveType: leaveForm.leaveType,
        note:      leaveForm.note || null,
      }),
    });
    if (r.ok) {
      await load();
      setLeaveForm(p => ({ ...p, startDate: "", endDate: "", note: "" }));
    } else {
      const d = await r.json().catch(() => ({}));
      setLeaveError(d.message ?? "Kayıt hatası.");
    }
    setLeaveSaving(false);
  };

  const deleteLeave = async (id: string) => {
    if (!confirm("Bu izin kaydı silinsin mi?")) return;
    const r = await apiFetch(`/Personel/leaves/${id}`, { method: "DELETE" });
    if (r.ok) setLeaves(prev => prev.filter(l => l.id !== id));
  };

  /* ── Exports ────────────────────────────────────────────────────── */
  const exportPuantajCSV = () => {
    const header = ["Personel", ...days.map(String), "Geldi", "Gelmedi", "İzin"];
    const rows   = stylists.map(s => {
      const cells = days.map(d => {
        const st = getCell(s.id, d)?.status ?? (isSunday(d) ? "T" : isOfficialDay(d) ? "RT" : "");
        return STATUS_LABELS[st]?.charAt(0) ?? st;
      });
      const p = days.filter(d => getCell(s.id, d)?.status === "present").length;
      const a = days.filter(d => getCell(s.id, d)?.status === "absent").length;
      const l = days.filter(d => getCell(s.id, d)?.status === "leave").length;
      return [s.fullName, ...cells, String(p), String(a), String(l)];
    });
    downloadCSV(toCSV([header, ...rows]), `puantaj-${year}-${String(month).padStart(2, "0")}.csv`);
  };

  const exportOzetCSV = () => {
    const header = ["Personel", "Ücret Tipi", "Geldi", "Gelmedi", "İzin", "Tatil", "İş Günü", "Oran%", "Tahmini Ücret"];
    const rows   = summary.map(s => {
      const pct = s.workingDays > 0 ? Math.round((s.present / s.workingDays) * 100) : 0;
      const sal = s.payType === "fixed_daily" ? s.present * (s.fixedSalary || 0) : (s.fixedSalary || 0);
      return [
        s.fullName, PAY_LABELS[s.payType] ?? s.payType,
        String(s.present), String(s.absent), String(s.leave), String(s.holiday),
        String(s.workingDays), `${pct}%`,
        s.payType === "commission" ? `%${s.commissionRate}` : `₺${fmt(sal)}`,
      ];
    });
    downloadCSV(toCSV([header, ...rows]), `ozet-${year}-${String(month).padStart(2, "0")}.csv`);
  };

  const exportIzinlerCSV = () => {
    const header = ["Personel", "İzin Türü", "Başlangıç", "Bitiş", "Gün", "Not"];
    const rows   = leaves.map(l => [
      l.stylistName,
      leaveTypeMap[l.leaveType]?.label ?? l.leaveType,
      l.startDate, l.endDate,
      String(leaveDayCount(l.startDate, l.endDate)),
      l.reason ?? "",
    ]);
    downloadCSV(toCSV([header, ...rows]), `izinler-${year}-${String(month).padStart(2, "0")}.csv`);
  };

  const printPage = () => window.print();

  /* ── Input style ────────────────────────────────────────────────── */
  const inp: React.CSSProperties = {
    padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border,#d0d5dd)",
    fontSize: 13, background: "var(--surface,#fff)", color: "var(--text,#101828)",
    minHeight: 38,
  };

  /* ══════════════════════════════════════════════════════════════════ */
  return (
    <AppShell title="Personel Yönetimi" description="Puantaj, izin ve maaş özeti">
      <style>{`@media print { .no-print { display: none !important; } .print-area { display: block !important; } body { font-size: 11px; } }`}</style>

      {/* ── Top bar ── */}
      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {/* Month nav */}
        <button onClick={() => { const d = new Date(year, month - 2); setYear(d.getFullYear()); setMonth(d.getMonth() + 1); }}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 14 }}>‹</button>
        <div style={{ fontWeight: 800, fontSize: 16, minWidth: 150, textAlign: "center" }}>{MONTHS[month - 1]} {year}</div>
        <button onClick={() => { const d = new Date(year, month); setYear(d.getFullYear()); setMonth(d.getMonth() + 1); }}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 14 }}>›</button>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {([["puantaj","📋 Puantaj"],["izinler","🏖 İzinler"],["ozet","📊 Özet"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              color: tab === k ? "#7c3aed" : "#64748b",
              borderBottom: tab === k ? "2px solid #7c3aed" : "2px solid transparent",
            }}>{lbl}</button>
          ))}
        </div>

        {/* Export buttons */}
        {tab === "puantaj" && <>
          <button onClick={exportPuantajCSV} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>⬇ CSV</button>
          <button onClick={printPage}        className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>🖨 Yazdır</button>
        </>}
        {tab === "izinler" && (
          <button onClick={exportIzinlerCSV} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>⬇ CSV</button>
        )}
        {tab === "ozet" && <>
          <button onClick={exportOzetCSV} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>⬇ CSV</button>
          <button onClick={printPage}     className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>🖨 Yazdır</button>
        </>}
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
          Yükleniyor...
        </div>
      ) : (<>

        {/* ══ PUANTAJ ══════════════════════════════════════════════════ */}
        {tab === "puantaj" && (
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "auto" }}>
            <div className="no-print" style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", fontSize: 11, color: "#94a3b8" }}>
              Hücreye tıklayarak döngüsel: Var → Yok → İzin → Tatil → temizle{saving && " · Kaydediliyor..."}
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, padding: "8px 16px", borderBottom: "1px solid #f1f5f9" }}>{MONTHS[month - 1]} {year} Puantaj Tablosu</div>
            <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "max-content", width: "100%" }}>
              <thead>
                <tr style={{ background: "#faf5ff" }}>
                  <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", position: "sticky", left: 0, background: "#faf5ff", zIndex: 1, minWidth: 140, borderRight: "1px solid #f1f5f9" }}>Personel</th>
                  {days.map(d => {
                    const off = isSunday(d);
                    const official = isOfficialDay(d);
                    return (
                      <th key={d} title={official ? officialDays.get(d) : undefined}
                        style={{ padding: "6px 3px", textAlign: "center", fontWeight: 700, width: 28, minWidth: 28,
                          color: official ? "#c2410c" : off ? "#3b82f6" : "#344054",
                          background: official ? "#fff7ed" : off ? "#eff6ff" : undefined }}>
                        {d}
                      </th>
                    );
                  })}
                  <th style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, whiteSpace: "nowrap", borderLeft: "1px solid #f1f5f9" }}>Özet</th>
                </tr>
              </thead>
              <tbody>
                {stylists.map((stylist, si) => {
                  const p = days.filter(d => getCell(stylist.id, d)?.status === "present").length;
                  const a = days.filter(d => getCell(stylist.id, d)?.status === "absent").length;
                  const l = days.filter(d => getCell(stylist.id, d)?.status === "leave").length;
                  return (
                    <tr key={stylist.id} style={{ borderTop: si === 0 ? "none" : "1px solid #f8fafc" }}>
                      <td style={{ padding: "6px 14px", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", position: "sticky", left: 0, background: "#fff", zIndex: 1, borderRight: "1px solid #f1f5f9" }}>
                        {stylist.fullName}
                      </td>
                      {days.map(d => {
                        const cell   = getCell(stylist.id, d);
                        const isSun  = isSunday(d);
                        const isOff  = isOfficialDay(d);
                        const status = cell?.status ?? (isSun ? "holiday" : isOff ? "official" : undefined);
                        const colors = status ? STATUS_COLORS[status] : null;
                        const clickable = !isSun && !isOff;
                        return (
                          <td key={d}
                            onClick={() => clickable && toggleCell(stylist.id, d)}
                            title={isOff ? officialDays.get(d) : undefined}
                            style={{ padding: 2, textAlign: "center", cursor: clickable ? "pointer" : "default",
                              background: isOff ? "#fff7ed" : isSun ? "#eff6ff" : undefined }}>
                            {status ? (
                              <div style={{ width: 22, height: 22, borderRadius: 5, background: colors?.bg, color: colors?.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, margin: "auto" }}>
                                {status === "official" ? "RT" : STATUS_LABELS[status]?.charAt(0)}
                              </div>
                            ) : (
                              <div style={{ width: 22, height: 22, borderRadius: 5, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#cbd5e1", margin: "auto" }}>·</div>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ padding: "6px 10px", textAlign: "center", fontSize: 11, borderLeft: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                        <span style={{ color: "#16a34a", fontWeight: 700 }}>{p}G</span>
                        {a > 0 && <span style={{ color: "#dc2626", marginLeft: 4 }}>{a}Y</span>}
                        {l > 0 && <span style={{ color: "#d97706", marginLeft: 4 }}>{l}İ</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Legend */}
            <div style={{ padding: "10px 16px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 14, flexWrap: "wrap" }}>
              {[
                ["present","Var"],["absent","Yok"],["leave","İzin"],["holiday","Tatil (Pazar)"],["official","Resmi Tatil"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, background: STATUS_COLORS[k]?.bg, color: STATUS_COLORS[k]?.text, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 9 }}>
                    {k === "official" ? "RT" : v.charAt(0)}
                  </div>
                  <span style={{ color: "#64748b" }}>{v}</span>
                </div>
              ))}
              <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: "auto" }}>🟠 = Resmi tatil (tıklanamaz) · 🔵 = Pazar</span>
            </div>
          </div>
        )}

        {/* ══ İZİNLER ══════════════════════════════════════════════════ */}
        {tab === "izinler" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Add leave form */}
            <div className="card no-print" style={{ padding: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Yeni İzin Kaydı</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#344054", display: "block", marginBottom: 5 }}>Personel *</label>
                  <select value={leaveForm.stylistId} onChange={e => setLeaveForm(p => ({ ...p, stylistId: e.target.value }))} style={{ ...inp, width: "100%" }}>
                    <option value="">Seçin...</option>
                    {stylists.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#344054", display: "block", marginBottom: 5 }}>İzin Türü *</label>
                  <select value={leaveForm.leaveType} onChange={e => setLeaveForm(p => ({ ...p, leaveType: e.target.value as LeaveTypeValue }))} style={{ ...inp, width: "100%" }}>
                    {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#344054", display: "block", marginBottom: 5 }}>Başlangıç *</label>
                  <input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(p => ({ ...p, startDate: e.target.value }))} style={{ ...inp, width: "100%" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#344054", display: "block", marginBottom: 5 }}>Bitiş *</label>
                  <input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm(p => ({ ...p, endDate: e.target.value }))} style={{ ...inp, width: "100%" }} />
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#344054", display: "block", marginBottom: 5 }}>Not</label>
                  <input value={leaveForm.note} onChange={e => setLeaveForm(p => ({ ...p, note: e.target.value }))} placeholder="Açıklama..." style={{ ...inp, width: "100%" }} />
                </div>
              </div>
              {leaveError && <div style={{ padding: "8px 12px", borderRadius: 8, background: "#fef2f2", color: "#b42318", fontSize: 13, marginBottom: 10 }}>⚠ {leaveError}</div>}
              <button onClick={addLeave} disabled={leaveSaving} className="btn btn-primary" style={{ minWidth: 140, opacity: leaveSaving ? 0.7 : 1 }}>
                {leaveSaving ? "Kaydediliyor..." : "+ İzin Ekle"}
              </button>
            </div>

            {/* Leave list */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #f1f5f9", fontWeight: 800, fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>İzin Kayıtları <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>({leaves.length})</span></span>
              </div>
              {leaves.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>İzin kaydı bulunamadı.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#faf5ff" }}>
                      {["Personel", "İzin Türü", "Başlangıç", "Bitiş", "Gün", "Not", ""].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((l, i) => {
                      const lt = leaveTypeMap[l.leaveType];
                      return (
                        <tr key={l.id} style={{ borderTop: i === 0 ? "none" : "1px solid #f8fafc" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 600 }}>{l.stylistName}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ padding: "3px 10px", borderRadius: 20, background: lt?.bg ?? "#f1f5f9", color: lt?.color ?? "#344054", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                              {lt?.label ?? l.leaveType}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", fontSize: 12 }}>{l.startDate}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12 }}>{l.endDate}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700 }}>{leaveDayCount(l.startDate, l.endDate)}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{l.reason ?? "—"}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <button onClick={() => deleteLeave(l.id)} className="no-print"
                              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, lineHeight: 1 }} title="Sil">×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Leave type legend */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#344054" }}>İzin Türleri</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {LEAVE_TYPES.map(t => (
                  <span key={t.value} style={{ padding: "4px 12px", borderRadius: 20, background: t.bg, color: t.color, fontSize: 11, fontWeight: 700 }}>{t.label}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ ÖZET ══════════════════════════════════════════════════════ */}
        {tab === "ozet" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#344054" }}>{MONTHS[month - 1]} {year} · Personel Özeti</div>
            {summary.map(s => {
              const pct       = s.workingDays > 0 ? Math.round((s.present / s.workingDays) * 100) : 0;
              const estSalary = s.payType === "commission" ? null
                : s.payType === "fixed_daily" ? s.present * (s.fixedSalary || 0)
                : s.fixedSalary || 0;
              // leaves for this stylist in selected month
              const stylistLeaves = leaves.filter(l => l.stylistId === s.id);
              const leaveByType = LEAVE_TYPES
                .map(t => ({ ...t, count: stylistLeaves.filter(l => l.leaveType === t.value).reduce((acc, l) => acc + leaveDayCount(l.startDate, l.endDate), 0) }))
                .filter(t => t.count > 0);

              return (
                <div key={s.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #eaecf0", padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{s.fullName}</div>
                      <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600, marginTop: 2 }}>{PAY_LABELS[s.payType] ?? s.payType}</div>
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <Chip label="Geldi"   value={s.present}  color="#16a34a" />
                      <Chip label="Gelmedi" value={s.absent}   color="#dc2626" />
                      <Chip label="İzin"    value={s.leave}    color="#d97706" />
                      <Chip label="Tatil"   value={s.holiday}  color="#0891b2" />
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {s.payType === "commission" ? (
                        <div style={{ fontSize: 13, color: "#64748b" }}>%{s.commissionRate} prim oranı</div>
                      ) : estSalary !== null ? (
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#7c3aed" }}>₺{fmt(estSalary)}</div>
                      ) : null}
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{s.present}/{s.workingDays} iş günü · %{pct}</div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ marginTop: 12, height: 6, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626", borderRadius: 999, transition: "width 0.3s" }} />
                  </div>
                  {/* Leave breakdown */}
                  {leaveByType.length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {leaveByType.map(t => (
                        <span key={t.value} style={{ padding: "3px 10px", borderRadius: 20, background: t.bg, color: t.color, fontSize: 11, fontWeight: 700 }}>
                          {t.label}: {t.count} gün
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {summary.length === 0 && (
              <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>Aktif personel bulunamadı.</div>
            )}
          </div>
        )}

      </>)}
    </AppShell>
  );
}

function Chip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#94a3b8" }}>{label}</div>
    </div>
  );
}
