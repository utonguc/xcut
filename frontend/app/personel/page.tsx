"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type Stylist = { id: string; fullName: string; photoUrl?: string; payType: string; fixedSalary: number; commissionRate: number; isActive: boolean };
type AttendanceRow = { id: string; stylistId: string; status: string; date: string; checkIn?: string; checkOut?: string; note?: string };
type Leave = { id: string; stylistId: string; stylistName: string; startDate: string; endDate: string; reason?: string };
type Summary = { id: string; fullName: string; payType: string; fixedSalary: number; commissionRate: number; present: number; absent: number; leave: number; holiday: number; workingDays: number };

const STATUS_LABELS: Record<string, string> = { present: "Var", absent: "Yok", leave: "İzin", holiday: "Tatil" };
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  present: { bg: "#dcfce7", text: "#166534" },
  absent:  { bg: "#fee2e2", text: "#991b1b" },
  leave:   { bg: "#fef3c7", text: "#92400e" },
  holiday: { bg: "#e0f2fe", text: "#075985" },
};
const PAY_LABELS: Record<string, string> = { commission: "Prim", fixed_monthly: "Aylık Sabit", fixed_weekly: "Haftalık Sabit", fixed_daily: "Günlük" };
const fmt = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

export default function PersonelPage() {
  const now = new Date();
  const [tab,      setTab]      = useState<"puantaj"|"izinler"|"ozet">("puantaj");
  const [year,     setYear]     = useState(now.getFullYear());
  const [month,    setMonth]    = useState(now.getMonth() + 1);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [leaves,   setLeaves]   = useState<Leave[]>([]);
  const [summary,  setSummary]  = useState<Summary[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const load = useCallback(async () => {
    setLoading(true);
    const [sRes, aRes, lRes, sumRes] = await Promise.all([
      apiFetch("/Stylists?activeOnly=true"),
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

  const getCell = (stylistId: string, day: number) => {
    const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return attendance.find(a => a.stylistId === stylistId && a.date === dateStr);
  };

  const toggleCell = async (stylistId: string, day: number) => {
    const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const current = attendance.find(a => a.stylistId === stylistId && a.date === dateStr);
    const statuses = ["present","absent","leave","holiday"];
    const nextIdx = current ? (statuses.indexOf(current.status) + 1) % statuses.length : 0;
    const nextStatus = statuses[nextIdx];

    setSaving(true);
    const r = await apiFetch("/Personel/attendance", {
      method: "PUT",
      body: JSON.stringify({ stylistId, date: dateStr, status: nextStatus }),
    });
    if (r.ok) {
      setAttendance(prev => {
        const filtered = prev.filter(a => !(a.stylistId === stylistId && a.date === dateStr));
        return [...filtered, { id: "", stylistId, status: nextStatus, date: dateStr }];
      });
    }
    setSaving(false);
  };

  // Determine if a day is Sunday
  const isDayOff = (day: number) => new Date(year, month - 1, day).getDay() === 0;

  return (
    <AppShell title="Personel Yönetimi">
      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={() => { const d = new Date(year, month - 2); setYear(d.getFullYear()); setMonth(d.getMonth() + 1); }}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 14 }}>‹</button>
        <div style={{ fontWeight: 800, fontSize: 16, minWidth: 140, textAlign: "center" }}>{MONTHS[month - 1]} {year}</div>
        <button onClick={() => { const d = new Date(year, month); setYear(d.getFullYear()); setMonth(d.getMonth() + 1); }}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 14 }}>›</button>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginLeft: "auto", borderBottom: "2px solid #f1f5f9" }}>
          {([["puantaj","📋 Puantaj"],["izinler","🏖 İzinler"],["ozet","📊 Özet"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              color: tab === k ? "#7c3aed" : "#64748b",
              borderBottom: tab === k ? "2px solid #7c3aed" : "2px solid transparent",
              marginBottom: -2,
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
      ) : (

        <>
          {/* ── PUANTAJ ── */}
          {tab === "puantaj" && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "auto" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", fontSize: 11, color: "#94a3b8" }}>
                Hücreye tıklayarak devam durumunu döngüsel olarak değiştirebilirsiniz.
                {saving && " · Kaydediliyor..."}
              </div>
              <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "max-content" }}>
                <thead>
                  <tr style={{ background: "#faf5ff" }}>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#344054", fontSize: 12, whiteSpace: "nowrap", position: "sticky", left: 0, background: "#faf5ff", zIndex: 1, minWidth: 140 }}>Personel</th>
                    {days.map(d => (
                      <th key={d} style={{ padding: "8px 4px", textAlign: "center", fontWeight: 700, color: isDayOff(d) ? "#ef4444" : "#344054", width: 32, minWidth: 32 }}>{d}</th>
                    ))}
                    <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, color: "#344054", whiteSpace: "nowrap" }}>Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {stylists.map((stylist, si) => {
                    const presentCount = days.filter(d => getCell(stylist.id, d)?.status === "present").length;
                    const absentCount  = days.filter(d => getCell(stylist.id, d)?.status === "absent").length;
                    const leaveCount   = days.filter(d => getCell(stylist.id, d)?.status === "leave").length;
                    return (
                      <tr key={stylist.id} style={{ borderTop: si === 0 ? "none" : "1px solid #f8fafc" }}>
                        <td style={{ padding: "8px 14px", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>
                          {stylist.fullName}
                        </td>
                        {days.map(d => {
                          const cell = getCell(stylist.id, d);
                          const status = cell?.status ?? (isDayOff(d) ? "holiday" : undefined);
                          const colors = status ? STATUS_COLORS[status] : null;
                          return (
                            <td key={d} onClick={() => !isDayOff(d) && toggleCell(stylist.id, d)}
                              style={{ padding: 3, textAlign: "center", cursor: isDayOff(d) ? "default" : "pointer" }}>
                              {status && (
                                <div style={{ width: 24, height: 24, borderRadius: 6, background: colors?.bg, color: colors?.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, margin: "auto" }}>
                                  {STATUS_LABELS[status]?.charAt(0)}
                                </div>
                              )}
                              {!status && !isDayOff(d) && (
                                <div style={{ width: 24, height: 24, borderRadius: 6, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#cbd5e1", margin: "auto" }}>·</div>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 11 }}>
                          <span style={{ color: "#16a34a", fontWeight: 700 }}>{presentCount}G</span>
                          {absentCount > 0 && <span style={{ color: "#dc2626", marginLeft: 4 }}>{absentCount}Y</span>}
                          {leaveCount > 0  && <span style={{ color: "#d97706", marginLeft: 4 }}>{leaveCount}İ</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Legend */}
              <div style={{ padding: "10px 16px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 16, flexWrap: "wrap" }}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: STATUS_COLORS[k].bg, color: STATUS_COLORS[k].text, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 10 }}>{v.charAt(0)}</div>
                    <span style={{ color: "#64748b" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── İZİNLER ── */}
          {tab === "izinler" && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontWeight: 800, fontSize: 14 }}>
                İzin Kayıtları
                <span style={{ marginLeft: 10, fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{leaves.length} kayıt</span>
              </div>
              {leaves.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>İzin kaydı bulunamadı.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#faf5ff" }}>
                      {["Personel","Başlangıç","Bitiş","Sebep"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((l, i) => (
                      <tr key={l.id} style={{ borderTop: i === 0 ? "none" : "1px solid #f8fafc" }}>
                        <td style={{ padding: "10px 16px", fontWeight: 600 }}>{l.stylistName}</td>
                        <td style={{ padding: "10px 16px", fontSize: 12 }}>{l.startDate}</td>
                        <td style={{ padding: "10px 16px", fontSize: 12 }}>{l.endDate}</td>
                        <td style={{ padding: "10px 16px", fontSize: 12, color: "#64748b" }}>{l.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f9", fontSize: 12, color: "#94a3b8" }}>
                İzin eklemek için Stilistler sayfasında ilgili stilistin Program bölümünü kullanın.
              </div>
            </div>
          )}

          {/* ── ÖZET ── */}
          {tab === "ozet" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {summary.map(s => {
                const worked    = s.present;
                const pct       = s.workingDays > 0 ? Math.round((worked / s.workingDays) * 100) : 0;
                const estSalary = s.payType === "commission"
                  ? null
                  : s.payType === "fixed_daily"
                    ? worked * (s.fixedSalary || 0)
                    : s.fixedSalary || 0;
                return (
                  <div key={s.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #eaecf0", padding: "16px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{s.fullName}</div>
                        <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600, marginTop: 2 }}>{PAY_LABELS[s.payType] ?? s.payType}</div>
                      </div>
                      <div style={{ display: "flex", gap: 16 }}>
                        <Chip label="Geldi" value={s.present}  color="#16a34a" />
                        <Chip label="Gelmedi" value={s.absent} color="#dc2626" />
                        <Chip label="İzin" value={s.leave}     color="#d97706" />
                        <Chip label="Tatil" value={s.holiday}  color="#0891b2" />
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {s.payType === "commission" ? (
                          <div style={{ fontSize: 13, color: "#64748b" }}>%{s.commissionRate} prim oranı</div>
                        ) : estSalary !== null ? (
                          <div style={{ fontSize: 16, fontWeight: 900, color: "#7c3aed" }}>₺{fmt(estSalary)}</div>
                        ) : null}
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          {worked}/{s.workingDays} iş günü · %{pct}
                        </div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ marginTop: 12, height: 6, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626", borderRadius: 999, transition: "width 0.3s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
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
