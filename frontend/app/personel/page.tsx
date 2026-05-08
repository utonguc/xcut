"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────────── */
type Stylist = { id: string; fullName: string; payType: string; fixedSalary: number; commissionRate: number };
type AttendanceRow = { id: string; stylistId: string; status: string; isHalfDay: boolean; date: string; note?: string };
type Leave = { id: string; stylistId: string; stylistName: string; startDate: string; endDate: string; leaveType: string; reason?: string };
type Summary = { id: string; fullName: string; payType: string; fixedSalary: number; commissionRate: number; present: number; presentHalf: number; absent: number; leave: number; holiday: number; workingDays: number };
type LeaveRequest = { id: string; stylistId: string; stylistName: string; leaveType: string; startDate: string; endDate: string; isHalfDay: boolean; note?: string; status: "Pending" | "Approved" | "Rejected"; requestedAt: string; rejectReason?: string };

/* ── Leave types (15 types) ─────────────────────────────────────────── */
const LEAVE_TYPES = [
  { value: "YillikIzin",     label: "Yıllık İzin",               abbr: "YI",  color: "#166534", bg: "#dcfce7" },
  { value: "HaftaTatili",    label: "Hafta Tatili",               abbr: "HT",  color: "#075985", bg: "#e0f2fe" },
  { value: "UlusalDini",     label: "Ulusal/Dini Bayram",         abbr: "UD",  color: "#7c2d12", bg: "#ffedd5" },
  { value: "ResmiTatil",     label: "Resmi Tatil",                abbr: "RT",  color: "#92400e", bg: "#fef3c7" },
  { value: "DogumIzni",      label: "Doğum İzni",                 abbr: "Dİ",  color: "#be185d", bg: "#fce7f3" },
  { value: "GebelikKontrol", label: "Gebelik Kontrol İzni",       abbr: "GK",  color: "#86198f", bg: "#fae8ff" },
  { value: "SutIzni",        label: "Süt İzni",                   abbr: "Sİ",  color: "#0e7490", bg: "#cffafe" },
  { value: "Babalik",        label: "Babalık İzni",               abbr: "Bİ",  color: "#065f46", bg: "#d1fae5" },
  { value: "OlumIzni",       label: "Ölüm İzni",                  abbr: "Öİ",  color: "#374151", bg: "#f3f4f6" },
  { value: "YeniIsArama",    label: "Yeni İş Arama İzni",         abbr: "YA",  color: "#713f12", bg: "#fefce8" },
  { value: "Evlilik",        label: "Evlilik İzni",               abbr: "Eİ",  color: "#9f1239", bg: "#ffe4e6" },
  { value: "Mazeret",        label: "Mazeret İzni",               abbr: "Mİ",  color: "#1d4ed8", bg: "#dbeafe" },
  { value: "Refakat",        label: "Refakat İzni",               abbr: "Rİ",  color: "#5b21b6", bg: "#ede9fe" },
  { value: "UcretliIzin",    label: "Ücretli İzin",               abbr: "Üİ",  color: "#065f46", bg: "#ecfdf5" },
  { value: "UcretsizIzin",   label: "Ücretsiz İzin",              abbr: "Üs",  color: "#7f1d1d", bg: "#fef2f2" },
] as const;
type LTValue = typeof LEAVE_TYPES[number]["value"];
const ltMap = Object.fromEntries(LEAVE_TYPES.map(t => [t.value, t])) as Record<string, typeof LEAVE_TYPES[number]>;

/* ── Status config ──────────────────────────────────────────────────── */
const STATUSES = {
  present:  { label: "Var",     abbr: "V",   color: "#166534", bg: "#dcfce7" },
  absent:   { label: "Yok",     abbr: "Y",   color: "#991b1b", bg: "#fee2e2" },
  leave:    { label: "İzin",    abbr: "İ",   color: "#92400e", bg: "#fef3c7" },
  holiday:  { label: "Tatil",   abbr: "T",   color: "#075985", bg: "#e0f2fe" },
  official: { label: "R.Tatil", abbr: "RT",  color: "#7c2d12", bg: "#ffedd5" },
} as const;
type StatusKey = keyof typeof STATUSES;

/* ── Turkish public holidays ────────────────────────────────────────── */
const TR_FIXED: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1,   name: "Yeni Yıl" },
  { month: 4, day: 23,  name: "Ulusal Egemenlik ve Çocuk Bayramı" },
  { month: 5, day: 1,   name: "Emek ve Dayanışma Günü" },
  { month: 5, day: 19,  name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
  { month: 7, day: 15,  name: "Demokrasi ve Milli Birlik Günü" },
  { month: 8, day: 30,  name: "Zafer Bayramı" },
  { month: 10, day: 29, name: "Cumhuriyet Bayramı" },
];
const TR_RELIGIOUS: { year: number; month: number; day: number; days: number; name: string }[] = [
  { year: 2025, month: 3, day: 30, days: 3, name: "Ramazan Bayramı" },
  { year: 2025, month: 6, day: 6,  days: 4, name: "Kurban Bayramı" },
  { year: 2026, month: 3, day: 20, days: 3, name: "Ramazan Bayramı" },
  { year: 2026, month: 5, day: 27, days: 4, name: "Kurban Bayramı" },
  { year: 2027, month: 3, day: 9,  days: 3, name: "Ramazan Bayramı" },
  { year: 2027, month: 5, day: 16, days: 4, name: "Kurban Bayramı" },
  { year: 2028, month: 2, day: 26, days: 3, name: "Ramazan Bayramı" },
  { year: 2028, month: 5, day: 5,  days: 4, name: "Kurban Bayramı" },
];
function getOfficialHolidays(year: number, month: number): Map<number, string> {
  const map = new Map<number, string>();
  TR_FIXED.filter(h => h.month === month).forEach(h => map.set(h.day, h.name));
  TR_RELIGIOUS.filter(h => h.year === year).forEach(h => {
    for (let d = 0; d < h.days; d++) {
      const dt = new Date(h.year, h.month - 1, h.day + d);
      if (dt.getMonth() + 1 === month) map.set(dt.getDate(), h.name);
    }
  });
  return map;
}

/* ── Helpers ────────────────────────────────────────────────────────── */
const MONTHS   = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const DAY_NAMES = ["Paz","Pzt","Sal","Çar","Per","Cum","Cmt"];
const PAY_LABELS: Record<string, string> = { commission: "Prim", fixed_monthly: "Aylık Sabit", fixed_weekly: "Haftalık Sabit", fixed_daily: "Günlük" };
const fmt = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const leaveDays = (s: string, e: string) => Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1;
function padDate(y: number, m: number, d: number) { return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function downloadCSV(content: string, fn: string) {
  const blob = new Blob(["﻿"+content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: fn });
  a.click(); URL.revokeObjectURL(url);
}
function toCSV(rows: string[][]) { return rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n"); }

/* ═══════════════════════════════════════════════════════════════════ */
export default function PersonelPage() {
  const now = new Date();
  const [tab,       setTab]       = useState<"puantaj"|"izinler"|"talepler"|"ozet">("puantaj");

  // Handle ?tab= URL param without useSearchParams (avoids Suspense requirement)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t === "izinler" || t === "talepler" || t === "ozet") setTab(t);
    }
  }, []);
  const [year,      setYear]      = useState(now.getFullYear());
  const [month,     setMonth]     = useState(now.getMonth() + 1);
  // self-only mode
  const [isSelfOnly,  setIsSelfOnly]  = useState(false);
  const [myStylistId, setMyStylistId] = useState<string | null>(null);
  const [stylists,  setStylists]  = useState<Stylist[]>([]);
  const [attendance,setAttendance]= useState<AttendanceRow[]>([]);
  const [leaves,    setLeaves]    = useState<Leave[]>([]);
  const [leaveReqs, setLeaveReqs] = useState<LeaveRequest[]>([]);
  const [summary,   setSummary]   = useState<Summary[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);

  // weekly off days
  const [weeklyOff,    setWeeklyOff]    = useState<number[]>([0]);
  const [woDraft,      setWoDraft]      = useState<number[]>([0]);
  const [woExpanded,   setWoExpanded]   = useState(false);
  const [woSaving,     setWoSaving]     = useState(false);

  // cell popover
  type CellMenu = { stylistId: string; day: number; top: number; left: number };
  const [cellMenu, setCellMenu] = useState<CellMenu | null>(null);

  // leave form
  const [leaveForm, setLeaveForm] = useState({ stylistId: "", leaveType: "YillikIzin" as LTValue, startDate: "", endDate: "", note: "" });
  const [leaveErr,  setLeaveErr]  = useState("");
  const [leaveSav,  setLeaveSav]  = useState(false);

  // leave request form
  const [reqForm, setReqForm]  = useState({ stylistId: "", leaveType: "YillikIzin" as LTValue, startDate: "", endDate: "", isHalfDay: false, note: "" });
  const [reqErr,  setReqErr]   = useState("");
  const [reqSav,  setReqSav]   = useState(false);

  // reject reason
  const [rejectId,     setRejectId]     = useState<string|null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const daysInMonth  = new Date(year, month, 0).getDate();
  const days         = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const officialDays = getOfficialHolidays(year, month);
  const isWeeklyOff  = (d: number) => weeklyOff.includes(new Date(year, month - 1, d).getDay());
  const isOfficialDay = (d: number) => officialDays.has(d);

  // pending count badge
  const pendingCount = leaveReqs.filter(r => r.status === "Pending").length;

  /* ── Load ───────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    const [meRes, sRes, aRes, lRes, rRes, sumRes, woRes] = await Promise.all([
      apiFetch("/Auth/me"),
      apiFetch("/Stylists?isActive=true"),
      apiFetch(`/Personel/attendance?year=${year}&month=${month}`),
      apiFetch("/Personel/leaves"),
      apiFetch("/Personel/leave-requests"),
      apiFetch(`/Personel/summary?year=${year}&month=${month}`),
      apiFetch("/Personel/weekly-off"),
    ]);

    let selfOnly = false;
    let selfStylistId: string | null = null;
    if (meRes.ok) {
      const me = await meRes.json();
      selfOnly = me.isSelfOnly ?? false;
      selfStylistId = me.stylistId ?? null;
      setIsSelfOnly(selfOnly);
      setMyStylistId(selfStylistId);
    }

    if (sRes.ok) {
      const all: Stylist[] = await sRes.json();
      setStylists(selfOnly && selfStylistId ? all.filter(s => s.id === selfStylistId) : all);
    }
    if (aRes.ok)   setAttendance(await aRes.json());
    if (lRes.ok)   setLeaves(await lRes.json());
    if (rRes.ok)   setLeaveReqs(await rRes.json());
    if (sumRes.ok) setSummary(await sumRes.json());
    if (woRes.ok) {
      const { days: d } = await woRes.json() as { days: string };
      const parsed = d ? d.split(",").map(Number).filter(n => !isNaN(n)) : [0];
      setWeeklyOff(parsed);
      setWoDraft(parsed);
    }
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  // close popover on outside click
  useEffect(() => {
    if (!cellMenu) return;
    const close = () => setCellMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [cellMenu]);

  /* ── Build leave-by-date lookup for puantaj abbreviations ───────── */
  const leaveByDate = useCallback((): Map<string, string> => {
    const map = new Map<string, string>();
    for (const l of leaves) {
      let cur = new Date(l.startDate);
      const end = new Date(l.endDate);
      while (cur <= end) {
        const key = `${l.stylistId}:${cur.toISOString().slice(0,10)}`;
        map.set(key, l.leaveType);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [leaves]);

  /* ── Weekly off save ────────────────────────────────────────────── */
  const saveWeeklyOff = async () => {
    setWoSaving(true);
    const r = await apiFetch("/Personel/weekly-off", { method: "PUT", body: JSON.stringify({ days: woDraft.join(",") }) });
    if (r.ok) { setWeeklyOff(woDraft); setWoExpanded(false); }
    setWoSaving(false);
  };

  /* ── Cell helpers ───────────────────────────────────────────────── */
  const getCell = (stylistId: string, day: number) =>
    attendance.find(a => a.stylistId === stylistId && a.date === padDate(year, month, day));

  const getDefaultStatus = (day: number): StatusKey | null => {
    if (isOfficialDay(day)) return "official";
    if (isWeeklyOff(day)) return "holiday";
    return null;
  };

  const openCellMenu = (e: React.MouseEvent, stylistId: string, day: number) => {
    if (isSelfOnly) return; // personel yalnızca görüntüleyebilir
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCellMenu({ stylistId, day, top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 240) });
  };

  const applyCell = async (status: StatusKey, isHalfDay: boolean) => {
    if (!cellMenu) return;
    const { stylistId, day } = cellMenu;
    setCellMenu(null);
    const date = padDate(year, month, day);
    setSaving(true);
    const r = await apiFetch("/Personel/attendance", {
      method: "PUT",
      body: JSON.stringify({ stylistId, date, status, isHalfDay }),
    });
    if (r.ok) {
      setAttendance(prev => [
        ...prev.filter(a => !(a.stylistId === stylistId && a.date === date)),
        { id: "", stylistId, status, isHalfDay, date },
      ]);
    }
    setSaving(false);
  };

  const clearCell = async () => {
    if (!cellMenu) return;
    const { stylistId, day } = cellMenu;
    setCellMenu(null);
    const date = padDate(year, month, day);
    setSaving(true);
    await apiFetch(`/Personel/attendance?stylistId=${stylistId}&date=${date}`, { method: "DELETE" });
    setAttendance(prev => prev.filter(a => !(a.stylistId === stylistId && a.date === date)));
    setSaving(false);
  };

  /* ── Leave CRUD ─────────────────────────────────────────────────── */
  const addLeave = async () => {
    setLeaveErr("");
    if (!leaveForm.stylistId || !leaveForm.startDate || !leaveForm.endDate) { setLeaveErr("Personel ve tarihler zorunlu."); return; }
    setLeaveSav(true);
    const r = await apiFetch("/Personel/leaves", { method: "POST", body: JSON.stringify({ stylistId: leaveForm.stylistId, startDate: leaveForm.startDate, endDate: leaveForm.endDate, leaveType: leaveForm.leaveType, note: leaveForm.note || null }) });
    if (r.ok) { await load(); setLeaveForm(p => ({ ...p, startDate: "", endDate: "", note: "" })); }
    else { const d = await r.json().catch(() => ({})); setLeaveErr((d as {message?: string}).message ?? "Kayıt hatası."); }
    setLeaveSav(false);
  };

  const deleteLeave = async (id: string) => {
    if (!confirm("Bu izin kaydı silinsin mi?")) return;
    if ((await apiFetch(`/Personel/leaves/${id}`, { method: "DELETE" })).ok)
      setLeaves(prev => prev.filter(l => l.id !== id));
  };

  /* ── Leave request CRUD ─────────────────────────────────────────── */
  const submitReq = async () => {
    setReqErr("");
    const reqStylistId = isSelfOnly && myStylistId ? myStylistId : reqForm.stylistId;
    if (!reqStylistId || !reqForm.startDate || !reqForm.endDate) { setReqErr("Personel ve tarihler zorunlu."); return; }
    setReqSav(true);
    const reqStylistIdFinal = isSelfOnly && myStylistId ? myStylistId : reqForm.stylistId;
    const r = await apiFetch("/Personel/leave-requests", { method: "POST", body: JSON.stringify({ stylistId: reqStylistIdFinal, startDate: reqForm.startDate, endDate: reqForm.endDate, leaveType: reqForm.leaveType, isHalfDay: reqForm.isHalfDay, note: reqForm.note || null }) });
    if (r.ok) { await load(); setReqForm(p => ({ ...p, startDate: "", endDate: "", note: "", isHalfDay: false })); }
    else { const d = await r.json().catch(() => ({})); setReqErr((d as {message?: string}).message ?? "Kayıt hatası."); }
    setReqSav(false);
  };

  const approve = async (id: string) => {
    await apiFetch(`/Personel/leave-requests/${id}/approve`, { method: "PATCH" });
    await load();
  };

  const reject = async () => {
    if (!rejectId) return;
    await apiFetch(`/Personel/leave-requests/${rejectId}/reject`, { method: "PATCH", body: JSON.stringify({ reason: rejectReason }) });
    setRejectId(null); setRejectReason("");
    await load();
  };

  /* ── Exports ────────────────────────────────────────────────────── */
  const lbd = leaveByDate();
  const exportPuantaj = () => {
    const header = ["Personel", ...days.map(String), "G", "Y", "İ"];
    const rows = stylists.map(s => {
      const cells = days.map(d => {
        const c = getCell(s.id, d);
        if (!c) return getDefaultStatus(d) === "official" ? "RT" : isWeeklyOff(d) ? "T" : "";
        return (c.isHalfDay ? "½" : "") + (STATUSES[c.status as StatusKey]?.abbr ?? c.status);
      });
      const p = days.filter(d => getCell(s.id, d)?.status === "present").length;
      const a = days.filter(d => getCell(s.id, d)?.status === "absent").length;
      const l = days.filter(d => getCell(s.id, d)?.status === "leave").length;
      return [s.fullName, ...cells, String(p), String(a), String(l)];
    });
    downloadCSV(toCSV([header, ...rows]), `puantaj-${year}-${String(month).padStart(2,"0")}.csv`);
  };
  const exportOzet = () => {
    const header = ["Personel","Ücret Tipi","Geldi","Gelmedi","İzin","Tatil","İş Günü","Oran%","Tahmini Ücret"];
    const rows = summary.map(s => {
      const pct = s.workingDays > 0 ? Math.round((s.present/s.workingDays)*100) : 0;
      const sal = s.payType === "fixed_daily" ? s.present*(s.fixedSalary||0) : (s.fixedSalary||0);
      return [s.fullName, PAY_LABELS[s.payType]??s.payType, String(s.present), String(s.absent), String(s.leave), String(s.holiday), String(s.workingDays), `${pct}%`, s.payType==="commission" ? `%${s.commissionRate}` : `₺${fmt(sal)}`];
    });
    downloadCSV(toCSV([header, ...rows]), `ozet-${year}-${String(month).padStart(2,"0")}.csv`);
  };
  const exportIzinler = () => {
    const header = ["Personel","İzin Türü","Başlangıç","Bitiş","Gün","Not"];
    const rows = leaves.map(l => [l.stylistName, ltMap[l.leaveType]?.label??l.leaveType, l.startDate, l.endDate, String(leaveDays(l.startDate,l.endDate)), l.reason??""]);
    downloadCSV(toCSV([header,...rows]), `izinler-${year}-${String(month).padStart(2,"0")}.csv`);
  };

  /* ── Styles ─────────────────────────────────────────────────────── */
  const inp: React.CSSProperties = { padding:"9px 12px", borderRadius:8, border:"1px solid var(--border,#d0d5dd)", fontSize:13, background:"var(--surface,#fff)", color:"var(--text,#101828)", minHeight:38 };

  /* ══════════════════════════════════════════════════════════════════ */
  return (
    <AppShell title="Personel Yönetimi" description="Puantaj, izin ve maaş özeti">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .card { border: 1px solid #ccc !important; box-shadow: none !important; }
          table { page-break-inside: auto; font-size: 9px !important; }
          tr { page-break-inside: avoid; }
          th, td { padding: 3px 4px !important; }
          * { color-adjust: exact; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* ── Top bar ── */}
      <div className="no-print" style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, flexWrap:"wrap" }}>
        <button onClick={() => { const d=new Date(year,month-2); setYear(d.getFullYear()); setMonth(d.getMonth()+1); }}
          style={{ padding:"8px 14px", borderRadius:8, border:"1px solid #e2e8f0", background:"#fff", cursor:"pointer", fontSize:14 }}>‹</button>
        <div style={{ fontWeight:800, fontSize:16, minWidth:150, textAlign:"center" }}>{MONTHS[month-1]} {year}</div>
        <button onClick={() => { const d=new Date(year,month); setYear(d.getFullYear()); setMonth(d.getMonth()+1); }}
          style={{ padding:"8px 14px", borderRadius:8, border:"1px solid #e2e8f0", background:"#fff", cursor:"pointer", fontSize:14 }}>›</button>

        {/* Tabs */}
        <div style={{ display:"flex", gap:4, marginLeft:"auto" }}>
          {([
            ["puantaj","📋 Puantaj", 0],
            ["izinler","🏖 İzinler", 0],
            ["talepler","📨 Talepler", pendingCount],
            ["ozet","📊 Özet", 0],
          ] as const).map(([k, lbl, cnt]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding:"8px 14px", border:"none", background:"none", cursor:"pointer",
              fontWeight:700, fontSize:13, position:"relative",
              color: tab===k ? "#7c3aed" : "#64748b",
              borderBottom: tab===k ? "2px solid #7c3aed" : "2px solid transparent",
            }}>
              {lbl}
              {cnt > 0 && <span style={{ marginLeft:4, background:"#ef4444", color:"#fff", borderRadius:999, padding:"0 6px", fontSize:10, fontWeight:800 }}>{cnt}</span>}
            </button>
          ))}
        </div>

        {/* Export */}
        {tab==="puantaj" && <><button onClick={exportPuantaj} className="btn btn-ghost" style={{ fontSize:12, padding:"6px 12px" }}>⬇ CSV</button><button onClick={() => window.print()} className="btn btn-ghost" style={{ fontSize:12, padding:"6px 12px" }}>🖨 Yazdır</button></>}
        {tab==="izinler" && <button onClick={exportIzinler} className="btn btn-ghost" style={{ fontSize:12, padding:"6px 12px" }}>⬇ CSV</button>}
        {tab==="ozet" && <><button onClick={exportOzet} className="btn btn-ghost" style={{ fontSize:12, padding:"6px 12px" }}>⬇ CSV</button><button onClick={() => window.print()} className="btn btn-ghost" style={{ fontSize:12, padding:"6px 12px" }}>🖨 Yazdır</button></>}
      </div>

      {loading ? (
        <div style={{ padding:48, textAlign:"center", color:"#94a3b8" }}>
          <div style={{ width:32, height:32, border:"3px solid #ede9fe", borderTopColor:"#7c3aed", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }}/>
          Yükleniyor...
        </div>
      ) : (<>

        {/* ══ PUANTAJ ══ */}
        {tab==="puantaj" && (<>
          {/* Weekly off config — managers only */}
          {!isSelfOnly && <div className="no-print card" style={{ padding:"12px 16px", marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontWeight:700, fontSize:13 }}>Hafta Tatili Günleri</span>
              <button onClick={() => setWoExpanded(!woExpanded)} className="btn btn-ghost" style={{ fontSize:12, padding:"4px 10px" }}>{woExpanded ? "Kapat" : "Düzenle"}</button>
            </div>
            {!woExpanded && (
              <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>
                {weeklyOff.map(d => DAY_NAMES[d]).join(", ")} · Tüm günler yine de düzenlenebilir
              </div>
            )}
            {woExpanded && (
              <div style={{ marginTop:12 }}>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
                  {DAY_NAMES.map((name,i) => (
                    <label key={i} style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", padding:"6px 10px", borderRadius:8, background: woDraft.includes(i) ? "#ede9fe" : "#f8fafc", border:`1px solid ${woDraft.includes(i) ? "#7c3aed" : "#e2e8f0"}`, fontSize:13, fontWeight:600, color: woDraft.includes(i) ? "#7c3aed" : "#64748b" }}>
                      <input type="checkbox" checked={woDraft.includes(i)}
                        onChange={e => setWoDraft(p => e.target.checked ? [...p,i] : p.filter(d=>d!==i))}
                        style={{ accentColor:"#7c3aed" }} />
                      {name}
                    </label>
                  ))}
                </div>
                <button onClick={saveWeeklyOff} disabled={woSaving} className="btn btn-primary" style={{ fontSize:12, padding:"6px 14px" }}>
                  {woSaving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            )}
          </div>}

          {/* Puantaj table */}
          <div style={{ background:"#fff", borderRadius:16, border:"1px solid #eaecf0", overflow:"auto" }}>
            <div className="no-print" style={{ padding:"8px 16px", borderBottom:"1px solid #f1f5f9", fontSize:11, color:"#94a3b8" }}>
              {isSelfOnly ? "Kendi puantajın" : `Hücreye tıkla → seçenekler${saving ? " · Kaydediliyor..." : ""}`}
            </div>
            <div style={{ fontWeight:700, fontSize:13, padding:"8px 16px", borderBottom:"1px solid #f1f5f9" }}>{MONTHS[month-1]} {year}</div>
            <table style={{ borderCollapse:"collapse", fontSize:11, minWidth:"max-content" }}>
              <thead>
                <tr style={{ background:"#faf5ff" }}>
                  <th style={{ padding:"8px 14px", textAlign:"left", fontWeight:700, fontSize:12, whiteSpace:"nowrap", position:"sticky", left:0, background:"#faf5ff", zIndex:1, minWidth:140, borderRight:"1px solid #f1f5f9" }}>Personel</th>
                  {days.map(d => {
                    const off = isOfficialDay(d);
                    const woff = isWeeklyOff(d);
                    return (
                      <th key={d} title={off ? officialDays.get(d) : woff ? "Hafta tatili" : undefined}
                        style={{ padding:"5px 3px", textAlign:"center", fontWeight:700, width:28, minWidth:28,
                          color: off ? "#c2410c" : woff ? "#3b82f6" : "#344054",
                          background: off ? "#fff7ed" : woff ? "#eff6ff" : undefined }}>
                        {d}
                      </th>
                    );
                  })}
                  <th style={{ padding:"6px 10px", textAlign:"center", fontWeight:700, whiteSpace:"nowrap", borderLeft:"1px solid #f1f5f9" }}>Özet</th>
                </tr>
              </thead>
              <tbody>
                {stylists.map((stylist, si) => {
                  const p  = days.filter(d => getCell(stylist.id,d)?.status==="present").length;
                  const a  = days.filter(d => getCell(stylist.id,d)?.status==="absent").length;
                  const l  = days.filter(d => getCell(stylist.id,d)?.status==="leave").length;
                  return (
                    <tr key={stylist.id} style={{ borderTop: si===0 ? "none" : "1px solid #f8fafc" }}>
                      <td style={{ padding:"6px 14px", fontWeight:700, fontSize:12, whiteSpace:"nowrap", position:"sticky", left:0, background:"#fff", zIndex:1, borderRight:"1px solid #f1f5f9" }}>
                        {stylist.fullName}
                      </td>
                      {days.map(d => {
                        const cell    = getCell(stylist.id, d);
                        const defStat = getDefaultStatus(d);
                        const status  = (cell?.status ?? defStat) as StatusKey | null;
                        const half    = cell?.isHalfDay ?? false;
                        const st      = status ? STATUSES[status] : null;
                        // leave type abbreviation if leave
                        const ltAbbr  = status==="leave"
                          ? (ltMap[lbd.get(`${stylist.id}:${padDate(year,month,d)}`)??""]?.abbr ?? "İ")
                          : null;
                        const isOff = isOfficialDay(d);
                        const isWO  = isWeeklyOff(d);
                        return (
                          <td key={d}
                            onClick={e => openCellMenu(e, stylist.id, d)}
                            title={isOff ? officialDays.get(d) : isWO ? "Hafta tatili — tıkla değiştir" : undefined}
                            style={{ padding:2, textAlign:"center", cursor:"pointer",
                              background: isOff ? "#fff7ed" : isWO ? "#eff6ff" : undefined }}>
                            {status ? (
                              <div style={{ width:24, height:24, borderRadius:5, background: st?.bg, color: st?.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, margin:"auto", opacity: half ? 0.65 : 1, border: half ? `1px dashed ${st?.color}` : undefined }}>
                                {half && "½"}{ltAbbr ?? st?.abbr}
                              </div>
                            ) : (
                              <div style={{ width:24, height:24, borderRadius:5, background:"#f8fafc", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#cbd5e1", margin:"auto" }}>·</div>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11, borderLeft:"1px solid #f1f5f9", whiteSpace:"nowrap" }}>
                        <span style={{ color:"#16a34a", fontWeight:700 }}>{p}G</span>
                        {a>0 && <span style={{ color:"#dc2626", marginLeft:4 }}>{a}Y</span>}
                        {l>0 && <span style={{ color:"#d97706", marginLeft:4 }}>{l}İ</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Legend */}
            <div style={{ padding:"8px 16px", borderTop:"1px solid #f1f5f9", display:"flex", gap:12, flexWrap:"wrap" }}>
              {Object.entries(STATUSES).map(([k,v]) => (
                <div key={k} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11 }}>
                  <div style={{ width:18, height:18, borderRadius:4, background:v.bg, color:v.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:9 }}>{v.abbr}</div>
                  <span style={{ color:"#64748b" }}>{v.label}</span>
                </div>
              ))}
              <span style={{ fontSize:11, color:"#94a3b8", marginLeft:"auto" }}>½ = Yarım gün · İzin hücresinde kısaltma = izin türü</span>
            </div>
          </div>

          {/* Cell options popup */}
          {cellMenu && (
            <div onClick={e => e.stopPropagation()}
              style={{ position:"fixed", top:cellMenu.top, left:cellMenu.left, zIndex:500, background:"#fff", borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,0.18)", border:"1px solid #eaecf0", padding:10, minWidth:200 }}>
              <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8, fontWeight:600 }}>Devam Durumu</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:5 }}>
                {([
                  ["present",false,"V"],["present",true,"½V"],
                  ["absent",false,"Y"],
                  ["leave",false,"İ"],["leave",true,"½İ"],
                  ["holiday",false,"T"],["official",false,"RT"],
                ] as [StatusKey, boolean, string][]).map(([st,half,lbl]) => (
                  <button key={`${st}${half}`} onClick={() => applyCell(st, half)}
                    style={{ padding:"6px 4px", borderRadius:7, border:`1px solid ${STATUSES[st].bg}`, background:STATUSES[st].bg, color:STATUSES[st].color, fontWeight:800, fontSize:12, cursor:"pointer" }}>
                    {lbl}
                  </button>
                ))}
              </div>
              <div style={{ borderTop:"1px solid #f1f5f9", marginTop:8, paddingTop:8 }}>
                <button onClick={clearCell} style={{ width:"100%", padding:"6px", borderRadius:7, border:"1px solid #e2e8f0", background:"#f8fafc", color:"#64748b", fontWeight:700, fontSize:11, cursor:"pointer" }}>
                  × Temizle
                </button>
              </div>
            </div>
          )}
        </>)}

        {/* ══ İZİNLER ══ */}
        {tab==="izinler" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Add form — managers only */}
            {!isSelfOnly && <div className="card no-print" style={{ padding:20 }}>
              <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>Yeni İzin Kaydı</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(170px,1fr))", gap:10, marginBottom:12 }}>
                <div><label style={{ fontSize:11, fontWeight:700, color:"#344054", display:"block", marginBottom:5 }}>Personel *</label>
                  <select value={leaveForm.stylistId} onChange={e => setLeaveForm(p=>({...p,stylistId:e.target.value}))} style={{...inp,width:"100%"}}>
                    <option value="">Seçin...</option>
                    {stylists.map(s=><option key={s.id} value={s.id}>{s.fullName}</option>)}
                  </select></div>
                <div><label style={{ fontSize:11, fontWeight:700, color:"#344054", display:"block", marginBottom:5 }}>İzin Türü *</label>
                  <select value={leaveForm.leaveType} onChange={e => setLeaveForm(p=>({...p,leaveType:e.target.value as LTValue}))} style={{...inp,width:"100%"}}>
                    {LEAVE_TYPES.map(t=><option key={t.value} value={t.value}>{t.abbr} — {t.label}</option>)}
                  </select></div>
                <div><label style={{ fontSize:11, fontWeight:700, color:"#344054", display:"block", marginBottom:5 }}>Başlangıç *</label>
                  <input type="date" value={leaveForm.startDate} onChange={e=>setLeaveForm(p=>({...p,startDate:e.target.value}))} style={{...inp,width:"100%"}}/></div>
                <div><label style={{ fontSize:11, fontWeight:700, color:"#344054", display:"block", marginBottom:5 }}>Bitiş *</label>
                  <input type="date" value={leaveForm.endDate} onChange={e=>setLeaveForm(p=>({...p,endDate:e.target.value}))} style={{...inp,width:"100%"}}/></div>
                <div style={{ gridColumn:"span 2" }}><label style={{ fontSize:11, fontWeight:700, color:"#344054", display:"block", marginBottom:5 }}>Not</label>
                  <input value={leaveForm.note} onChange={e=>setLeaveForm(p=>({...p,note:e.target.value}))} placeholder="Açıklama..." style={{...inp,width:"100%"}}/></div>
              </div>
              {leaveErr && <div style={{ padding:"8px 12px", borderRadius:8, background:"#fef2f2", color:"#b42318", fontSize:13, marginBottom:10 }}>⚠ {leaveErr}</div>}
              <button onClick={addLeave} disabled={leaveSav} className="btn btn-primary" style={{ minWidth:140, opacity:leaveSav?.7:1 }}>{leaveSav?"Kaydediliyor...":"+ İzin Ekle"}</button>
            </div>}

            {/* Leave list */}
            <div style={{ background:"#fff", borderRadius:16, border:"1px solid #eaecf0", overflow:"hidden" }}>
              <div style={{ padding:"12px 18px", borderBottom:"1px solid #f1f5f9", fontWeight:800, fontSize:14 }}>
                İzin Kayıtları <span style={{ fontSize:12, color:"#94a3b8", fontWeight:500 }}>({leaves.length})</span>
              </div>
              {leaves.length===0 ? (
                <div style={{ padding:40, textAlign:"center", color:"#94a3b8" }}>İzin kaydı bulunamadı.</div>
              ) : (
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead><tr style={{ background:"#faf5ff" }}>
                    {["Personel","İzin Türü","Başlangıç","Bitiş","Gün","Not",""].map(h=>
                      <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontWeight:700, color:"#64748b", fontSize:12 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {leaves.map((l,i) => {
                      const lt = ltMap[l.leaveType];
                      return (
                        <tr key={l.id} style={{ borderTop:i===0?"none":"1px solid #f8fafc" }}>
                          <td style={{ padding:"10px 14px", fontWeight:600 }}>{l.stylistName}</td>
                          <td style={{ padding:"10px 14px" }}>
                            <span style={{ padding:"3px 10px", borderRadius:20, background:lt?.bg??"#f1f5f9", color:lt?.color??"#344054", fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
                              {lt?.abbr} — {lt?.label??l.leaveType}
                            </span>
                          </td>
                          <td style={{ padding:"10px 14px", fontSize:12 }}>{l.startDate}</td>
                          <td style={{ padding:"10px 14px", fontSize:12 }}>{l.endDate}</td>
                          <td style={{ padding:"10px 14px", fontSize:12, fontWeight:700 }}>{leaveDays(l.startDate,l.endDate)}</td>
                          <td style={{ padding:"10px 14px", fontSize:12, color:"#64748b" }}>{l.reason??"—"}</td>
                          {!isSelfOnly && <td style={{ padding:"10px 14px" }}>
                            <button onClick={()=>deleteLeave(l.id)} className="no-print" style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
                          </td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Leave type legend */}
            <div className="card" style={{ padding:14 }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>İzin Türleri ve Kısaltmaları</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {LEAVE_TYPES.map(t=>(
                  <span key={t.value} style={{ padding:"3px 10px", borderRadius:20, background:t.bg, color:t.color, fontSize:11, fontWeight:700 }}>
                    {t.abbr} — {t.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ TALEPLER ══ */}
        {tab==="talepler" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Submit new request */}
            <div className="card no-print" style={{ padding:20 }}>
              <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>
                {isSelfOnly ? "İzin Talebi Oluştur" : "Yeni İzin Talebi Oluştur"}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(170px,1fr))", gap:10, marginBottom:12 }}>
                {!isSelfOnly && <div><label style={{ fontSize:11, fontWeight:700, color:"#344054", display:"block", marginBottom:5 }}>Personel *</label>
                  <select value={reqForm.stylistId} onChange={e=>setReqForm(p=>({...p,stylistId:e.target.value}))} style={{...inp,width:"100%"}}>
                    <option value="">Seçin...</option>
                    {stylists.map(s=><option key={s.id} value={s.id}>{s.fullName}</option>)}
                  </select></div>}
                <div><label style={{ fontSize:11, fontWeight:700, color:"#344054", display:"block", marginBottom:5 }}>İzin Türü *</label>
                  <select value={reqForm.leaveType} onChange={e=>setReqForm(p=>({...p,leaveType:e.target.value as LTValue}))} style={{...inp,width:"100%"}}>
                    {LEAVE_TYPES.map(t=><option key={t.value} value={t.value}>{t.abbr} — {t.label}</option>)}
                  </select></div>
                <div><label style={{ fontSize:11, fontWeight:700, color:"#344054", display:"block", marginBottom:5 }}>Başlangıç *</label>
                  <input type="date" value={reqForm.startDate} onChange={e=>setReqForm(p=>({...p,startDate:e.target.value}))} style={{...inp,width:"100%"}}/></div>
                <div><label style={{ fontSize:11, fontWeight:700, color:"#344054", display:"block", marginBottom:5 }}>Bitiş *</label>
                  <input type="date" value={reqForm.endDate} onChange={e=>setReqForm(p=>({...p,endDate:e.target.value}))} style={{...inp,width:"100%"}}/></div>
                <div><label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginTop:22 }}>
                  <input type="checkbox" checked={reqForm.isHalfDay} onChange={e=>setReqForm(p=>({...p,isHalfDay:e.target.checked}))} style={{ accentColor:"#7c3aed", width:16, height:16 }}/>
                  <span style={{ fontSize:13, fontWeight:600 }}>Yarım gün</span>
                </label></div>
                <div><label style={{ fontSize:11, fontWeight:700, color:"#344054", display:"block", marginBottom:5 }}>Not</label>
                  <input value={reqForm.note} onChange={e=>setReqForm(p=>({...p,note:e.target.value}))} placeholder="Açıklama..." style={{...inp,width:"100%"}}/></div>
              </div>
              {reqErr && <div style={{ padding:"8px 12px", borderRadius:8, background:"#fef2f2", color:"#b42318", fontSize:13, marginBottom:10 }}>⚠ {reqErr}</div>}
              <button onClick={submitReq} disabled={reqSav} className="btn btn-primary" style={{ minWidth:160, opacity:reqSav?.7:1 }}>{reqSav?"Kaydediliyor...":"+ Talep Oluştur"}</button>
            </div>

            {/* Requests list */}
            {(["Pending","Approved","Rejected"] as const).map(s => {
              const items = leaveReqs.filter(r=>r.status===s);
              if (items.length===0 && s!=="Pending") return null;
              const cfg = { Pending:{ label:"Bekleyen", bg:"#fef3c7", color:"#92400e", border:"#fde68a" }, Approved:{ label:"Onaylandı", bg:"#dcfce7", color:"#166534", border:"#bbf7d0" }, Rejected:{ label:"Reddedildi", bg:"#fee2e2", color:"#991b1b", border:"#fecaca" } }[s];
              return (
                <div key={s} style={{ background:"#fff", borderRadius:16, border:`2px solid ${cfg.border}`, overflow:"hidden" }}>
                  <div style={{ padding:"12px 18px", borderBottom:`1px solid ${cfg.border}`, fontWeight:800, fontSize:14, background:cfg.bg, color:cfg.color, display:"flex", justifyContent:"space-between" }}>
                    <span>{cfg.label} Talepler</span>
                    <span style={{ fontWeight:500, fontSize:12 }}>{items.length} talep</span>
                  </div>
                  {items.length===0 ? (
                    <div style={{ padding:"20px", textAlign:"center", color:"#94a3b8", fontSize:13 }}>Bekleyen talep yok.</div>
                  ) : (
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                      <thead><tr style={{ background:"#f8fafc" }}>
                        {["Personel","İzin Türü","Başlangıç","Bitiş","Gün","Not",s==="Pending"?"İşlem":"Durum"].map(h=>
                          <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontWeight:700, color:"#64748b", fontSize:12 }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {items.map((r,i)=>{
                          const lt=ltMap[r.leaveType];
                          return (
                            <tr key={r.id} style={{ borderTop:i===0?"none":"1px solid #f8fafc" }}>
                              <td style={{ padding:"10px 14px", fontWeight:600 }}>{r.stylistName}</td>
                              <td style={{ padding:"10px 14px" }}>
                                <span style={{ padding:"2px 8px", borderRadius:20, background:lt?.bg??"#f1f5f9", color:lt?.color??"#344054", fontSize:11, fontWeight:700 }}>{lt?.abbr} — {lt?.label??r.leaveType}</span>
                                {r.isHalfDay && <span style={{ marginLeft:6, fontSize:11, color:"#64748b" }}>½ gün</span>}
                              </td>
                              <td style={{ padding:"10px 14px", fontSize:12 }}>{r.startDate}</td>
                              <td style={{ padding:"10px 14px", fontSize:12 }}>{r.endDate}</td>
                              <td style={{ padding:"10px 14px", fontSize:12, fontWeight:700 }}>{leaveDays(r.startDate,r.endDate)}{r.isHalfDay?" (½)":""}</td>
                              <td style={{ padding:"10px 14px", fontSize:12, color:"#64748b", maxWidth:160 }}>{r.note??"—"}{r.rejectReason && <><br/><span style={{ color:"#dc2626" }}>Red sebebi: {r.rejectReason}</span></>}</td>
                              <td style={{ padding:"10px 14px" }}>
                                {s==="Pending" && !isSelfOnly ? (
                                  <div className="no-print" style={{ display:"flex", gap:6 }}>
                                    <button onClick={()=>approve(r.id)} style={{ padding:"5px 12px", borderRadius:7, border:"none", background:"#dcfce7", color:"#166534", fontWeight:700, fontSize:12, cursor:"pointer" }}>Onayla</button>
                                    <button onClick={()=>{ setRejectId(r.id); setRejectReason(""); }} style={{ padding:"5px 12px", borderRadius:7, border:"none", background:"#fee2e2", color:"#991b1b", fontWeight:700, fontSize:12, cursor:"pointer" }}>Reddet</button>
                                  </div>
                                ) : (
                                  <span style={{ padding:"3px 10px", borderRadius:20, background:cfg.bg, color:cfg.color, fontSize:11, fontWeight:700 }}>{s==="Pending"?"Beklemede":cfg.label}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}

            {/* Reject modal */}
            {rejectId && (<>
              <div onClick={()=>setRejectId(null)} style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:400 }}/>
              <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:401, background:"#fff", borderRadius:16, padding:24, width:"min(400px,90vw)", boxShadow:"0 16px 48px rgba(0,0,0,0.2)" }}>
                <div style={{ fontWeight:800, fontSize:16, marginBottom:14 }}>Talebi Reddet</div>
                <label style={{ fontSize:12, fontWeight:700, color:"#344054", display:"block", marginBottom:6 }}>Red Sebebi (isteğe bağlı)</label>
                <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} style={{ ...inp, width:"100%", resize:"vertical" }} placeholder="Açıklama..." />
                <div style={{ display:"flex", gap:10, marginTop:14 }}>
                  <button onClick={()=>setRejectId(null)} className="btn btn-ghost" style={{ flex:1 }}>İptal</button>
                  <button onClick={reject} className="btn" style={{ flex:2, background:"#dc2626", color:"#fff", border:"none", borderRadius:10, fontWeight:700, cursor:"pointer" }}>Reddet</button>
                </div>
              </div>
            </>)}
          </div>
        )}

        {/* ══ ÖZET ══ */}
        {tab==="ozet" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ fontWeight:700, fontSize:13, color:"#344054" }}>{MONTHS[month-1]} {year} · Personel Özeti</div>
            {summary.map(s=>{
              const pct = s.workingDays>0 ? Math.round((s.present/s.workingDays)*100) : 0;
              const estSal = s.payType==="commission" ? null : s.payType==="fixed_daily" ? s.present*(s.fixedSalary||0) : (s.fixedSalary||0);
              const stylistLeaves = leaves.filter(l=>l.stylistId===s.id);
              const leaveByType = LEAVE_TYPES
                .map(t=>({ ...t, count: stylistLeaves.filter(l=>l.leaveType===t.value).reduce((acc,l)=>acc+leaveDays(l.startDate,l.endDate),0) }))
                .filter(t=>t.count>0);
              return (
                <div key={s.id} style={{ background:"#fff", borderRadius:14, border:"1px solid #eaecf0", padding:"16px 20px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:15 }}>{s.fullName}</div>
                      <div style={{ fontSize:12, color:"#7c3aed", fontWeight:600, marginTop:2 }}>{PAY_LABELS[s.payType]??s.payType}</div>
                    </div>
                    <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                      <Chip label="Geldi" value={s.present} color="#16a34a" sub={s.presentHalf>0?`${s.presentHalf} yarım`:undefined}/>
                      <Chip label="Gelmedi" value={s.absent} color="#dc2626"/>
                      <Chip label="İzin" value={s.leave} color="#d97706"/>
                      <Chip label="Tatil" value={s.holiday} color="#0891b2"/>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      {s.payType==="commission" ? (
                        <div style={{ fontSize:13, color:"#64748b" }}>%{s.commissionRate} prim oranı</div>
                      ) : estSal!==null ? (
                        <div style={{ fontSize:18, fontWeight:900, color:"#7c3aed" }}>₺{fmt(estSal)}</div>
                      ) : null}
                      <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{s.present}/{s.workingDays} iş günü · %{pct}</div>
                    </div>
                  </div>
                  <div style={{ marginTop:10, height:6, borderRadius:999, background:"#f1f5f9", overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${pct}%`, background: pct>=80?"#16a34a":pct>=50?"#d97706":"#dc2626", borderRadius:999, transition:"width 0.3s" }}/>
                  </div>
                  {leaveByType.length>0 && (
                    <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:6 }}>
                      {leaveByType.map(t=>(
                        <span key={t.value} style={{ padding:"3px 10px", borderRadius:20, background:t.bg, color:t.color, fontSize:11, fontWeight:700 }}>
                          {t.abbr} {t.label}: {t.count} gün
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {summary.length===0 && <div style={{ padding:60, textAlign:"center", color:"#94a3b8" }}>Aktif personel bulunamadı.</div>}
          </div>
        )}

      </>)}
    </AppShell>
  );
}

function Chip({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div style={{ textAlign:"center" }}>
      <div style={{ fontSize:18, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:10, color:"#94a3b8" }}>{label}</div>
      {sub && <div style={{ fontSize:9, color:"#94a3b8" }}>{sub}</div>}
    </div>
  );
}
