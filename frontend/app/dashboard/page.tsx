"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

/* ── Types ──────────────────────────────────────────────────────────── */
type WidgetDef     = { widgetType: string; label: string; sortOrder: number; size: string };
type AvailableWidget = { widgetType: string; label: string };
type KpiData       = { value: number | string; label: string; trendPct: number; note?: string };
type ApptItem      = { id: string; customer: string; stylist: string; serviceName: string; startAtUtc: string; status: string };
type StylistLoad   = { stylist: string; count: number };
type MonthlyAppt   = { year: number; month: number; count: number };
type ServiceBreak  = { service: string; count: number };
type WidgetData    = KpiData | ApptItem[] | StylistLoad[] | MonthlyAppt[] | ServiceBreak[];

/* ── Constants ──────────────────────────────────────────────────────── */
const META: Record<string, { icon: string; color: string; unit?: string }> = {
  kpi_customers:          { icon: "👥", color: "#0ea5e9" },
  kpi_stylists:           { icon: "✂️", color: "#7c3aed" },
  kpi_appointments:       { icon: "📅", color: "#8b5cf6" },
  kpi_revenue:            { icon: "💰", color: "#22c55e", unit: "₺" },
  kpi_pending_requests:   { icon: "⏳", color: "#ef4444" },
  calendar_upcoming:      { icon: "🗓️", color: "#7c3aed" },
  list_latest_appts:      { icon: "📋", color: "#7c3aed" },
  list_pending_requests:  { icon: "📋", color: "#ef4444" },
  chart_stylist_load:     { icon: "📊", color: "#7c3aed" },
  chart_monthly_appts:    { icon: "📈", color: "#7c3aed" },
  chart_service_breakdown:{ icon: "🥧", color: "#7c3aed" },
};

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  Pending:   { bg: "#fef3c7", color: "#92400e", label: "Bekliyor" },
  Confirmed: { bg: "#dcfce7", color: "#15803d", label: "Onaylandı" },
  Completed: { bg: "#e0e7ff", color: "#3730a3", label: "Tamamlandı" },
  Cancelled: { bg: "#fee2e2", color: "#991b1b", label: "İptal" },
};

const MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

/* size string → column span (1 | 2 | 4) */
const toSpan = (size: string): 1 | 2 | 4 => {
  if (size === "1") return 1;
  if (size === "4" || size === "full") return 4;
  return 2; // "2" | "large" | "medium" | default
};

const NEXT_SPAN: Record<number, number> = { 1: 2, 2: 4, 4: 1 };
const SPAN_LABEL: Record<number, string> = { 1: "1×", 2: "2×", 4: "4×" };

/* ── Sub-components ─────────────────────────────────────────────────── */
function BarChart({ bars, color = "#7c3aed" }: { bars: { label: string; value: number }[]; color?: string }) {
  if (!bars.length) return <p style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: 24 }}>Veri yok</p>;
  const max = Math.max(...bars.map(b => b.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, paddingTop: 8 }}>
      {bars.map(b => (
        <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color }}>{b.value}</div>
          <div style={{ width: "100%", borderRadius: "4px 4px 0 0", background: color, opacity: 0.8, height: `${Math.max(4, (b.value / max) * 80)}px`, transition: "height 0.3s" }} />
          <div style={{ fontSize: 9, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", textAlign: "center" }}>{b.label}</div>
        </div>
      ))}
    </div>
  );
}

function ApptRow({ item }: { item: ApptItem }) {
  const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.Pending;
  const dt = new Date(item.startAtUtc);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f2f4f7" }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>✂️</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.customer}</div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>{item.stylist} · {item.serviceName}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>{dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })}</div>
        <div style={{ fontSize: 10, color: "#94a3b8" }}>{dt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</div>
      </div>
      <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, flexShrink: 0 }}>{badge.label}</span>
    </div>
  );
}

/* ── Widget content (no gridColumn logic here — wrapper handles it) ── */
function WidgetContent({ def, data, onRefresh, refreshing }: {
  def: WidgetDef; data: WidgetData | null | undefined;
  onRefresh: () => void; refreshing: boolean;
}) {
  const meta = META[def.widgetType];

  /* KPI */
  if (def.widgetType.startsWith("kpi_")) {
    const d = data as KpiData | null;
    return (
      <div className="card" style={{ height: "100%" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: (meta?.color ?? "#7c3aed") + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
              {meta?.icon ?? "📊"}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>{def.label}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#101828", letterSpacing: "-0.5px" }}>
                {meta?.unit}{d ? d.value : "—"}
              </div>
            </div>
          </div>
          <button onClick={onRefresh} title="Yenile" style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 14, padding: 4, borderRadius: 6, lineHeight: 1, flexShrink: 0 }}>
            {refreshing ? "⟳" : "↺"}
          </button>
        </div>
        {d?.trendPct !== undefined && d.trendPct !== 0 && (
          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 10, color: d.trendPct >= 0 ? "#16a34a" : "#ef4444" }}>
            {d.trendPct >= 0 ? "↑" : "↓"} {Math.abs(d.trendPct)}% geçen aya göre
          </div>
        )}
        {d?.note && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{d.note}</div>}
      </div>
    );
  }

  /* Lists */
  if (def.widgetType.startsWith("calendar_") || def.widgetType.startsWith("list_")) {
    const items = (data as ApptItem[] | null) ?? [];
    return (
      <div className="card" style={{ height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{meta?.icon} {def.label}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={onRefresh} title="Yenile" style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 14, padding: 4, borderRadius: 6, lineHeight: 1 }}>
              {refreshing ? "⟳" : "↺"}
            </button>
            <Link href="/appointments" style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600, textDecoration: "none" }}>Tümü →</Link>
          </div>
        </div>
        {items.length === 0
          ? <p style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: 20 }}>Kayıt yok</p>
          : <div>{items.slice(0, 6).map(item => <ApptRow key={item.id} item={item} />)}</div>
        }
      </div>
    );
  }

  /* Charts */
  const isChart = def.widgetType.startsWith("chart_");
  if (isChart) {
    let bars: { label: string; value: number }[] = [];
    let subtitle = "";
    let chartColor = "#7c3aed";
    if (def.widgetType === "chart_stylist_load")      { bars = ((data as StylistLoad[]   | null) ?? []).map(x => ({ label: x.stylist,                     value: x.count })); subtitle = "Önümüzdeki 7 gün"; }
    if (def.widgetType === "chart_monthly_appts")     { bars = ((data as MonthlyAppt[]   | null) ?? []).map(x => ({ label: MONTHS[x.month - 1],            value: x.count })); subtitle = "Son 6 ay"; chartColor = "#8b5cf6"; }
    if (def.widgetType === "chart_service_breakdown") { bars = ((data as ServiceBreak[]  | null) ?? []).map(x => ({ label: x.service ?? "—",               value: x.count })); subtitle = "Bu ay"; chartColor = "#a78bfa"; }
    return (
      <div className="card" style={{ height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{meta?.icon} {def.label}</div>
          <button onClick={onRefresh} title="Yenile" style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 14, padding: 4, borderRadius: 6, lineHeight: 1 }}>
            {refreshing ? "⟳" : "↺"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>{subtitle}</div>
        <BarChart bars={bars} color={chartColor} />
      </div>
    );
  }

  return (
    <div className="card" style={{ height: "100%" }}>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{def.label}</div>
      <div style={{ fontSize: 24, fontWeight: 900 }}>—</div>
    </div>
  );
}

/* ── Dashboard Page ─────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [widgets,    setWidgets]    = useState<WidgetDef[]>([]);
  const [available,  setAvailable]  = useState<AvailableWidget[]>([]);
  const [dataMap,    setDataMap]    = useState<Record<string, WidgetData>>({});
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [editMode,   setEditMode]   = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [dragIdx,    setDragIdx]    = useState<number | null>(null);
  const [dragOver,   setDragOver]   = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchWidgetData = useCallback(async (widgetType: string) => {
    const r = await apiFetch(`/Dashboard/data/${widgetType}`);
    if (r.ok) {
      const d = await r.json();
      setDataMap(prev => ({ ...prev, [widgetType]: d }));
    }
  }, []);

  const refreshWidget = useCallback(async (widgetType: string) => {
    setRefreshing(prev => ({ ...prev, [widgetType]: true }));
    await fetchWidgetData(widgetType);
    setRefreshing(prev => ({ ...prev, [widgetType]: false }));
  }, [fetchWidgetData]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [wRes, avRes] = await Promise.all([
        apiFetch("/Dashboard/widgets"),
        apiFetch("/Dashboard/available-widgets"),
      ]);
      const ws: WidgetDef[]       = wRes.ok  ? await wRes.json()  : [];
      const av: AvailableWidget[] = avRes.ok ? await avRes.json() : [];
      const sorted = [...ws].sort((a, b) => a.sortOrder - b.sortOrder);
      setWidgets(sorted);
      setAvailable(av);
      const entries = await Promise.all(
        sorted.map(async w => {
          const r = await apiFetch(`/Dashboard/data/${w.widgetType}`);
          const d = r.ok ? await r.json() : null;
          return [w.widgetType, d] as [string, WidgetData];
        })
      );
      setDataMap(Object.fromEntries(entries.filter(([, v]) => v !== null)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const saveWidgets = useCallback((list: WidgetDef[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await apiFetch("/Dashboard/widgets", {
        method: "POST",
        body: JSON.stringify({
          Widgets: list.map((w, i) => ({ WidgetType: w.widgetType, SortOrder: i, Size: String(toSpan(w.size)) })),
        }),
      });
    }, 600);
  }, []);

  const toggleWidget = (widgetType: string) => {
    const active = widgets.some(w => w.widgetType === widgetType);
    let next: WidgetDef[];
    if (active) {
      next = widgets.filter(w => w.widgetType !== widgetType);
    } else {
      const av = available.find(a => a.widgetType === widgetType);
      if (!av) return;
      const defaultSpan = widgetType.startsWith("kpi_") ? "1" : "2";
      next = [...widgets, { widgetType, label: av.label, sortOrder: widgets.length, size: defaultSpan }];
    }
    setWidgets(next);
    saveWidgets(next);
  };

  const cycleSize = (widgetType: string) => {
    const next = widgets.map(w =>
      w.widgetType !== widgetType ? w
        : { ...w, size: String(NEXT_SPAN[toSpan(w.size)] ?? 2) }
    );
    setWidgets(next);
    saveWidgets(next);
  };

  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return;
    const next = [...widgets];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(toIdx, 0, moved);
    setWidgets(next);
    saveWidgets(next);
    setDragIdx(null);
    setDragOver(null);
  };

  return (
    <AppShell
      title="Dashboard"
      description="Salon durumuna genel bakış"
      actions={
        <button
          onClick={() => setEditMode(e => !e)}
          className="btn btn-ghost"
          style={{ fontSize: 13, background: editMode ? "#ede9fe" : undefined, color: editMode ? "#7c3aed" : undefined }}
        >
          {editMode ? "✓ Düzenlemeyi Bitir" : "⚙ Düzenle"}
        </button>
      }
    >
      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>
          <div style={{ width: 36, height: 36, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          Yükleniyor...
        </div>
      ) : (
        <>
          {/* Widget seçim paneli */}
          {editMode && (
            <div className="card" style={{ marginBottom: 20, background: "#faf5ff", border: "1.5px solid #e9d5ff" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "#7c3aed" }}>Widget Ekle / Kaldır</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {available.map(av => {
                  const active = widgets.some(w => w.widgetType === av.widgetType);
                  return (
                    <button key={av.widgetType} onClick={() => toggleWidget(av.widgetType)} style={{
                      padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                      border: `2px solid ${active ? "#7c3aed" : "#e2e8f0"}`,
                      background: active ? "#ede9fe" : "#fff",
                      color: active ? "#7c3aed" : "#64748b",
                      transition: "all .15s",
                    }}>
                      {META[av.widgetType]?.icon} {av.label} {active ? "✓" : "+"}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>
                💡 Widget'ları sürükleyerek yeniden sıralayın · boyut butonuna tıklayarak 1× / 2× / 4× arasında geçiş yapın
              </div>
            </div>
          )}

          {widgets.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Dashboard boş</div>
              <div style={{ color: "#64748b", marginBottom: 20 }}>Widget eklemek için düzenle butonuna tıklayın.</div>
              <button onClick={() => setEditMode(true)} className="btn btn-primary">Widget Ekle</button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {widgets.map((w, idx) => {
                const span = toSpan(w.size);
                const isDragging = dragIdx === idx;
                const isTarget   = dragOver === idx && dragIdx !== idx;

                return (
                  <div
                    key={w.widgetType}
                    draggable={editMode}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragIdx(idx); }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOver !== idx) setDragOver(idx); }}
                    onDrop={(e) => { e.preventDefault(); handleDrop(idx); }}
                    onDragEnd={() => { setDragIdx(null); setDragOver(null); }}
                    style={{
                      gridColumn: `span ${Math.min(span, 4)}`,
                      position: "relative",
                      opacity: isDragging ? 0.3 : 1,
                      transition: "opacity .2s",
                      outline: isTarget ? "2.5px dashed #7c3aed" : "none",
                      outlineOffset: 3,
                      borderRadius: 18,
                    }}
                  >
                    {/* Edit overlay controls */}
                    {editMode && (
                      <div style={{
                        position: "absolute", top: 10, right: 10, zIndex: 20,
                        display: "flex", gap: 5, alignItems: "center",
                      }}>
                        {/* Drag handle */}
                        <div
                          style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: "#7c3aed", color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "grab", fontSize: 16, userSelect: "none",
                            boxShadow: "0 2px 8px rgba(124,58,237,.35)",
                          }}
                          title="Sürükle"
                        >⠿</div>
                        {/* Size toggle */}
                        <button
                          onClick={() => cycleSize(w.widgetType)}
                          title="Boyut değiştir"
                          style={{
                            height: 30, padding: "0 10px", borderRadius: 8, border: "none",
                            background: "#7c3aed", color: "#fff", fontSize: 11, fontWeight: 800,
                            cursor: "pointer", boxShadow: "0 2px 8px rgba(124,58,237,.35)",
                          }}
                        >{SPAN_LABEL[span]}</button>
                        {/* Remove */}
                        <button
                          onClick={() => toggleWidget(w.widgetType)}
                          title="Kaldır"
                          style={{
                            width: 30, height: 30, borderRadius: 8, border: "none",
                            background: "#ef4444", color: "#fff", fontSize: 16, fontWeight: 700,
                            cursor: "pointer", lineHeight: 1,
                            boxShadow: "0 2px 8px rgba(239,68,68,.35)",
                          }}
                        >×</button>
                      </div>
                    )}

                    <WidgetContent
                      def={w}
                      data={dataMap[w.widgetType]}
                      onRefresh={() => refreshWidget(w.widgetType)}
                      refreshing={!!refreshing[w.widgetType]}
                    />
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
