"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

/* ── Backend response types ─────────────────────────────────────── */
type WidgetDef = { widgetType: string; label: string; sortOrder: number; size: string };
type AvailableWidget = { widgetType: string; label: string };

type KpiData      = { value: number | string; label: string; trendPct: number; note?: string };
type ApptItem     = { id: string; customer: string; stylist: string; serviceName: string; startAtUtc: string; status: string };
type StylistLoad  = { stylist: string; count: number };
type MonthlyAppt  = { year: number; month: number; count: number };
type ServiceBreak = { service: string; count: number };

type WidgetData = KpiData | ApptItem[] | StylistLoad[] | MonthlyAppt[] | ServiceBreak[];

/* ── Widget metadata ────────────────────────────────────────────── */
const META: Record<string, { icon: string; color: string; unit?: string }> = {
  kpi_customers:        { icon: "👥", color: "#0ea5e9" },
  kpi_stylists:         { icon: "✂️", color: "#7c3aed" },
  kpi_appointments:     { icon: "📅", color: "#8b5cf6" },
  kpi_revenue:          { icon: "💰", color: "#22c55e", unit: "₺" },
  kpi_pending_requests: { icon: "⏳", color: "#ef4444" },
  calendar_upcoming:    { icon: "🗓️", color: "#7c3aed" },
  list_latest_appts:    { icon: "📋", color: "#7c3aed" },
  list_pending_requests:{ icon: "📋", color: "#ef4444" },
  chart_stylist_load:   { icon: "📊", color: "#7c3aed" },
  chart_monthly_appts:  { icon: "📈", color: "#7c3aed" },
  chart_service_breakdown:{ icon: "🥧", color: "#7c3aed" },
};

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  Pending:   { bg: "#fef3c7", color: "#92400e", label: "Bekliyor" },
  Confirmed: { bg: "#dcfce7", color: "#15803d", label: "Onaylandı" },
  Completed: { bg: "#e0e7ff", color: "#3730a3", label: "Tamamlandı" },
  Cancelled: { bg: "#fee2e2", color: "#991b1b", label: "İptal" },
};

const MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

/* ── Bar chart ──────────────────────────────────────────────────── */
function BarChart({ bars, color = "#7c3aed" }: { bars: { label: string; value: number }[]; color?: string }) {
  if (!bars.length) return <p style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: 24 }}>Veri yok</p>;
  const max = Math.max(...bars.map(b => b.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, paddingTop: 8 }}>
      {bars.map(b => (
        <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color }}>{b.value}</div>
          <div style={{
            width: "100%", borderRadius: "4px 4px 0 0",
            background: color, opacity: 0.8,
            height: `${Math.max(4, (b.value / max) * 80)}px`,
            transition: "height 0.3s",
          }} />
          <div style={{ fontSize: 9, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", textAlign: "center" }}>{b.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Appointment row ────────────────────────────────────────────── */
function ApptRow({ item }: { item: ApptItem }) {
  const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.Pending;
  const dt = new Date(item.startAtUtc);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border,#f2f4f7)" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>✂️</div>
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

/* ── Widget renderer ────────────────────────────────────────────── */
function Widget({ def, data }: { def: WidgetDef; data: WidgetData | null | undefined }) {
  const meta = META[def.widgetType];
  const isLarge = def.size === "large" || def.widgetType.startsWith("chart") || def.widgetType.startsWith("list") || def.widgetType.startsWith("calendar");

  /* KPI */
  if (def.widgetType.startsWith("kpi_")) {
    const d = data as KpiData | null;
    return (
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: (meta?.color ?? "#7c3aed") + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
            {meta?.icon ?? "📊"}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>{def.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "var(--text,#101828)", letterSpacing: "-0.5px" }}>
              {meta?.unit}{d ? d.value : "—"}
            </div>
          </div>
        </div>
        {d?.trendPct !== undefined && d.trendPct !== 0 && (
          <div style={{ fontSize: 12, fontWeight: 600, color: d.trendPct >= 0 ? "#16a34a" : "#ef4444" }}>
            {d.trendPct >= 0 ? "↑" : "↓"} {Math.abs(d.trendPct)}% geçen aya göre
          </div>
        )}
        {d?.note && <div style={{ fontSize: 11, color: "#64748b" }}>{d.note}</div>}
      </div>
    );
  }

  /* Appointment lists (calendar_upcoming, list_latest_appts, list_pending_requests) */
  if (def.widgetType.startsWith("calendar_") || def.widgetType.startsWith("list_")) {
    const items = (data as ApptItem[] | null) ?? [];
    return (
      <div className="card" style={{ gridColumn: isLarge ? "span 2" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{meta?.icon} {def.label}</div>
          <Link href="/appointments" style={{ fontSize: 12, color: "var(--primary,#7c3aed)", fontWeight: 600, textDecoration: "none" }}>Tümü →</Link>
        </div>
        {items.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: 20 }}>Kayıt yok</p>
        ) : (
          <div>{items.slice(0, 6).map(item => <ApptRow key={item.id} item={item} />)}</div>
        )}
      </div>
    );
  }

  /* Charts */
  if (def.widgetType === "chart_stylist_load") {
    const bars = ((data as StylistLoad[] | null) ?? []).map(x => ({ label: x.stylist, value: x.count }));
    return (
      <div className="card" style={{ gridColumn: "span 2" }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>📊 {def.label}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>Önümüzdeki 7 gün</div>
        <BarChart bars={bars} color="#7c3aed" />
      </div>
    );
  }

  if (def.widgetType === "chart_monthly_appts") {
    const bars = ((data as MonthlyAppt[] | null) ?? []).map(x => ({ label: MONTHS[x.month - 1], value: x.count }));
    return (
      <div className="card" style={{ gridColumn: "span 2" }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>📈 {def.label}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>Son 6 ay</div>
        <BarChart bars={bars} color="#8b5cf6" />
      </div>
    );
  }

  if (def.widgetType === "chart_service_breakdown") {
    const bars = ((data as ServiceBreak[] | null) ?? []).map(x => ({ label: x.service ?? "—", value: x.count }));
    return (
      <div className="card" style={{ gridColumn: "span 2" }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🥧 {def.label}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>Bu ay</div>
        <BarChart bars={bars} color="#a78bfa" />
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{def.label}</div>
      <div style={{ fontSize: 24, fontWeight: 900 }}>—</div>
    </div>
  );
}

/* ── Dashboard Page ─────────────────────────────────────────────── */
export default function DashboardPage() {
  const [widgets,   setWidgets]   = useState<WidgetDef[]>([]);
  const [available, setAvailable] = useState<AvailableWidget[]>([]);
  const [dataMap,   setDataMap]   = useState<Record<string, WidgetData>>({});
  const [editMode,  setEditMode]  = useState(false);
  const [loading,   setLoading]   = useState(true);

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

  const saveWidgets = async (list: WidgetDef[]) => {
    await apiFetch("/Dashboard/widgets", {
      method: "POST",
      body: JSON.stringify({
        Widgets: list.map((w, i) => ({ WidgetType: w.widgetType, SortOrder: i, Size: w.size })),
      }),
    });
    loadDashboard();
  };

  const toggleWidget = (widgetType: string) => {
    const active = widgets.some(w => w.widgetType === widgetType);
    if (active) {
      saveWidgets(widgets.filter(w => w.widgetType !== widgetType));
    } else {
      const av = available.find(a => a.widgetType === widgetType);
      if (!av) return;
      saveWidgets([...widgets, { widgetType, label: av.label, sortOrder: widgets.length, size: widgetType.startsWith("chart") || widgetType.startsWith("list") || widgetType.startsWith("calendar") ? "large" : "medium" }]);
    }
  };

  return (
    <AppShell
      title="Dashboard"
      description="Salon durumuna genel bakış"
      actions={
        <button onClick={() => setEditMode(e => !e)} className="btn btn-ghost" style={{ fontSize: 13 }}>
          {editMode ? "✓ Bitti" : "⚙ Widget Düzenle"}
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
          {/* Edit panel */}
          {editMode && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Widget Seçimi</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {available.map(av => {
                  const active = widgets.some(w => w.widgetType === av.widgetType);
                  return (
                    <button
                      key={av.widgetType}
                      onClick={() => toggleWidget(av.widgetType)}
                      style={{
                        padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        border: `2px solid ${active ? "#7c3aed" : "#e2e8f0"}`,
                        background: active ? "#ede9fe" : "var(--surface,#fff)",
                        color: active ? "#7c3aed" : "#64748b",
                      }}
                    >
                      {META[av.widgetType]?.icon} {av.label} {active ? "✓" : "+"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Widget grid */}
          {widgets.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Dashboard boş</div>
              <div style={{ color: "#64748b", marginBottom: 20 }}>Widget eklemek için düzenle butonuna tıklayın.</div>
              <button onClick={() => setEditMode(true)} className="btn btn-primary">Widget Ekle</button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {widgets.map(w => <Widget key={w.widgetType} def={w} data={dataMap[w.widgetType]} />)}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
