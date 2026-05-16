"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch, getToken, API_BASE_URL } from "@/lib/api";
import { useToast } from "@/components/Toast";

type Appt = {
  id: string;
  customerName: string;
  stylistName?: string;
  serviceName?: string;
  startAtUtc: string;
  status: string;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export default function SiraPage() {
  const { toast } = useToast();
  const [appts,     setAppts]     = useState<Appt[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [updating,  setUpdating]  = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch("/Kiosk/queue");
    if (r.ok) { const d = await r.json(); setAppts(d.appointments ?? []); }
    setLoading(false);
  }, []);

  // SSE connection
  useEffect(() => {
    load();

    const connect = () => {
      const token = getToken();
      if (!token) return;
      const es = new EventSource(`${API_BASE_URL}/Kiosk/events?token=${encodeURIComponent(token)}`);
      esRef.current = es;

      es.addEventListener("connected", () => setConnected(true));

      es.addEventListener("queue_update", (e: MessageEvent) => {
        try {
          const updated = JSON.parse(e.data) as Appt;
          setAppts(prev => {
            const idx = prev.findIndex(a => a.id === updated.id);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], ...updated };
            return next;
          });
        } catch { /* ignore */ }
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        setTimeout(connect, 3000);
      };
    };

    connect();
    return () => { esRef.current?.close(); };
  }, [load]);

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    const r = await apiFetch(`/Appointments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setUpdating(null);
    if (r.ok) {
      setAppts(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    } else {
      toast.error("Durum güncellenemedi.");
    }
  };

  const inProgress = appts.filter(a => a.status === "InProgress");
  const waiting    = [...appts.filter(a => a.status === "Scheduled" || a.status === "Late")]
    .sort((a, b) => new Date(a.startAtUtc).getTime() - new Date(b.startAtUtc).getTime());
  const done       = [...appts.filter(a => a.status === "Completed" || a.status === "NoShow")]
    .sort((a, b) => new Date(b.startAtUtc).getTime() - new Date(a.startAtUtc).getTime());

  return (
    <AppShell
      title="Sıra Yönetimi"
      description="Bugünkü kuyruk — masa başından kontrol et"
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "#22c55e" : "#f59e0b", display: "inline-block" }} />
            <span style={{ color: "#64748b" }}>{connected ? "Canlı" : "Bağlanıyor..."}</span>
          </div>
          <button onClick={load} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            ↻ Yenile
          </button>
        </div>
      }
    >
      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
      ) : appts.filter(a => a.status !== "Cancelled").length === 0 ? (
        <div style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 700, color: "#64748b" }}>Bugün için randevu yok</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

          {/* İşlemde */}
          {inProgress.length > 0 && (
            <section>
              <SectionHeader label="İşlemde" count={inProgress.length} color="#22c55e" />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {inProgress.map(a => (
                  <ApptCard
                    key={a.id}
                    appt={a}
                    accent="#22c55e"
                    updating={updating === a.id}
                    actions={[
                      { label: "✓ Tamamla",  status: "Completed", color: "#16a34a", bg: "#dcfce7" },
                      { label: "✗ Gelmedi",  status: "NoShow",    color: "#dc2626", bg: "#fee2e2" },
                      { label: "← Geri",     status: "Scheduled", color: "#64748b", bg: "#f1f5f9" },
                    ]}
                    onAction={updateStatus}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Bekliyor */}
          {waiting.length > 0 && (
            <section>
              <SectionHeader label="Bekleyenler" count={waiting.length} color="#7c3aed" />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {waiting.map((a, idx) => (
                  <ApptCard
                    key={a.id}
                    appt={a}
                    accent="#7c3aed"
                    queueNum={idx + 1}
                    updating={updating === a.id}
                    actions={[
                      { label: "▶ Çağır",    status: "InProgress", color: "#7c3aed", bg: "#ede9fe" },
                      { label: "✗ Gelmedi",  status: "NoShow",     color: "#dc2626", bg: "#fee2e2" },
                      { label: "✗ İptal",    status: "Cancelled",  color: "#94a3b8", bg: "#f1f5f9" },
                    ]}
                    onAction={updateStatus}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Tamamlananlar */}
          {done.length > 0 && (
            <section>
              <SectionHeader label="Tamamlananlar" count={done.length} color="#94a3b8" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {done.slice(0, 10).map(a => (
                  <ApptCard
                    key={a.id}
                    appt={a}
                    accent="#94a3b8"
                    compact
                    updating={updating === a.id}
                    actions={
                      a.status === "Completed"
                        ? [{ label: "← Geri Al", status: "InProgress", color: "#64748b", bg: "#f1f5f9" }]
                        : []
                    }
                    onAction={updateStatus}
                  />
                ))}
              </div>
            </section>
          )}

        </div>
      )}
    </AppShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>{label}</span>
      <span style={{ background: color + "22", color, fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>{count}</span>
    </div>
  );
}

type ActionDef = { label: string; status: string; color: string; bg: string };

function ApptCard({
  appt, accent, queueNum, compact = false, updating, actions, onAction,
}: {
  appt: Appt;
  accent: string;
  queueNum?: number;
  compact?: boolean;
  updating: boolean;
  actions: ActionDef[];
  onAction: (id: string, status: string) => void;
}) {
  return (
    <div style={{
      background: "#fff",
      border: `1.5px solid ${accent}33`,
      borderLeft: `4px solid ${accent}`,
      borderRadius: 12,
      padding: compact ? "12px 16px" : "16px 20px",
      display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      opacity: updating ? 0.6 : 1,
      transition: "opacity 0.15s",
    }}>
      {queueNum !== undefined && (
        <div style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          background: accent + "18", border: `1.5px solid ${accent}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 16, color: accent,
        }}>{queueNum}</div>
      )}
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontWeight: 800, fontSize: compact ? 14 : 16, color: "#0f172a" }}>{appt.customerName}</div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
          {fmtTime(appt.startAtUtc)}
          {appt.serviceName && <span style={{ marginLeft: 8 }}>{appt.serviceName}</span>}
          {appt.stylistName && <span style={{ marginLeft: 8 }}>• {appt.stylistName}</span>}
        </div>
      </div>
      {actions.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          {actions.map(act => (
            <button
              key={act.status}
              onClick={() => !updating && onAction(appt.id, act.status)}
              disabled={updating}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "none",
                background: act.bg, color: act.color, fontWeight: 700,
                fontSize: 12, cursor: updating ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {act.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
