"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────── */
type Widget = {
  id: string;
  type: string;
  title: string;
  order: number;
  enabled: boolean;
};

type KpiData = {
  value: number | string;
  change?: number;
  changeLabel?: string;
};

type ChartPoint = { label: string; value: number };

type WidgetData =
  | { kind: "kpi"; data: KpiData }
  | { kind: "chart"; data: ChartPoint[] }
  | { kind: "list"; data: { id: string; label: string; sub?: string; badge?: string }[] };

/* ── KPI metadata ─────────────────────────────────────────────── */
const KPI_META: Record<string, { icon: string; color: string; unit?: string }> = {
  kpi_today_appointments: { icon: "📅", color: "#7c3aed" },
  kpi_total_customers:    { icon: "👥", color: "#0ea5e9" },
  kpi_active_stylists:    { icon: "✂️", color: "#f59e0b" },
  kpi_monthly_revenue:    { icon: "💰", color: "#22c55e", unit: "₺" },
  kpi_pending_requests:   { icon: "⏳", color: "#ef4444" },
  kpi_satisfaction:       { icon: "⭐", color: "#f59e0b" },
};

/* ── Chart component ──────────────────────────────────────────── */
function BarChart({ data }: { data: ChartPoint[] }) {
  if (!data.length) return <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: 20 }}>Veri yok</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, paddingTop: 8 }}>
      {data.map(d => (
        <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed" }}>{d.value}</div>
          <div style={{
            width: "100%", borderRadius: "4px 4px 0 0",
            background: "linear-gradient(180deg, #7c3aed 0%, #a78bfa 100%)",
            height: `${Math.max(4, (d.value / max) * 80)}px`,
            minHeight: 4, transition: "height 0.3s ease",
          }} />
          <div style={{ fontSize: 9, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", textAlign: "center" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Dashboard Page ───────────────────────────────────────────── */
export default function DashboardPage() {
  const [widgets,   setWidgets]   = useState<Widget[]>([]);
  const [dataMap,   setDataMap]   = useState<Record<string, WidgetData>>({});
  const [available, setAvailable] = useState<Widget[]>([]);
  const [editMode,  setEditMode]  = useState(false);
  const [loading,   setLoading]   = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [wRes, avRes] = await Promise.all([
        apiFetch("/Dashboard/widgets"),
        apiFetch("/Dashboard/available-widgets"),
      ]);
      const ws: Widget[] = wRes.ok ? await wRes.json() : [];
      const av: Widget[] = avRes.ok ? await avRes.json() : [];
      const enabled = ws.filter(w => w.enabled).sort((a, b) => a.order - b.order);
      setWidgets(enabled);
      setAvailable(av);

      // Load data for each widget
      const entries = await Promise.all(
        enabled.map(async w => {
          try {
            const r = await apiFetch(`/Dashboard/data/${w.type}`);
            const d = r.ok ? await r.json() : null;
            return [w.type, d] as [string, WidgetData];
          } catch {
            return [w.type, null] as [string, null];
          }
        })
      );
      setDataMap(Object.fromEntries(entries.filter(([, v]) => v !== null)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const toggleWidget = async (widgetType: string, enabled: boolean) => {
    await apiFetch("/Dashboard/widgets", {
      method: "POST",
      body: JSON.stringify({ widgetType, enabled }),
    });
    loadDashboard();
  };

  const renderWidget = (widget: Widget) => {
    const raw = dataMap[widget.type];
    const meta = KPI_META[widget.type];

    // KPI widget
    if (widget.type.startsWith("kpi_") || (raw as { kind?: string })?.kind === "kpi") {
      const d = (raw as { kind: "kpi"; data: KpiData })?.data;
      const val = d?.value ?? "—";
      const change = d?.change;
      return (
        <div key={widget.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: (meta?.color ?? "#7c3aed") + "18",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, flexShrink: 0,
            }}>
              {meta?.icon ?? "📊"}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>{widget.title}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "var(--text,#101828)", letterSpacing: "-0.5px" }}>
                {meta?.unit}{val}
              </div>
            </div>
          </div>
          {change !== undefined && (
            <div style={{ fontSize: 12, fontWeight: 600, color: change >= 0 ? "#16a34a" : "#ef4444" }}>
              {change >= 0 ? "↑" : "↓"} {Math.abs(change)}% {d?.changeLabel ?? "geçen haftaya göre"}
            </div>
          )}
        </div>
      );
    }

    // Chart widget
    if ((raw as { kind?: string })?.kind === "chart") {
      const d = (raw as { kind: "chart"; data: ChartPoint[] }).data;
      return (
        <div key={widget.id} className="card" style={{ gridColumn: "span 2" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{widget.title}</div>
          <BarChart data={d} />
        </div>
      );
    }

    // List widget
    if ((raw as { kind?: string })?.kind === "list") {
      const d = (raw as { kind: "list"; data: { id: string; label: string; sub?: string; badge?: string }[] }).data;
      return (
        <div key={widget.id} className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{widget.title}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {d.slice(0, 5).map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: "var(--primary-light,#ede9fe)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, flexShrink: 0,
                }}>
                  📋
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</div>
                  {item.sub && <div style={{ fontSize: 11, color: "#94a3b8" }}>{item.sub}</div>}
                </div>
                {item.badge && (
                  <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#ede9fe", color: "#7c3aed" }}>{item.badge}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Fallback: empty KPI card
    return (
      <div key={widget.id} className="card">
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>{widget.title}</div>
        <div style={{ fontSize: 24, fontWeight: 900 }}>—</div>
      </div>
    );
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
                {available.map(w => {
                  const active = widgets.some(x => x.type === w.type);
                  return (
                    <button
                      key={w.type}
                      onClick={() => toggleWidget(w.type, !active)}
                      style={{
                        padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600,
                        border: `2px solid ${active ? "#7c3aed" : "#e2e8f0"}`,
                        background: active ? "#ede9fe" : "var(--surface,#fff)",
                        color: active ? "#7c3aed" : "#64748b",
                        cursor: "pointer",
                      }}
                    >
                      {active ? "✓ " : ""}{w.title}
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
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 16,
            }}>
              {widgets.map(renderWidget)}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
