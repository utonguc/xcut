"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type Log = { id: string; userName?: string; entityType: string; entityId: string; action: string; description: string; ipAddress?: string; createdAtUtc: string };
type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

const actionColor: Record<string, string> = { Create: "#16a34a", Update: "#2563eb", Delete: "#dc2626", Login: "#d97706" };

export default function DenetimPage() {
  const [logs,        setLogs]        = useState<Log[]>([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(false);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [filterType,  setFilterType]  = useState("");
  const [filterFrom,  setFilterFrom]  = useState("");
  const [filterTo,    setFilterTo]    = useState("");

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: "50" });
    if (filterType) params.set("entityType", filterType);
    if (filterFrom) params.set("from", filterFrom);
    if (filterTo)   params.set("to",   filterTo);
    const r = await apiFetch(`/AuditLog?${params}`);
    if (r.ok) { const d: Paged<Log> = await r.json(); setLogs(d.items); setTotal(d.total); }
    setLoading(false);
  }, [filterType, filterFrom, filterTo]);

  useEffect(() => {
    apiFetch("/AuditLog/entity-types").then(r => r.ok ? r.json() : []).then(setEntityTypes);
  }, []);

  useEffect(() => { setPage(1); }, [filterType, filterFrom, filterTo]);
  useEffect(() => { load(page); }, [load, page]);

  return (
    <AppShell title="Denetim Günlüğü">
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={lbl}>Varlık Tipi</div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={sel}>
            <option value="">Tümü</option>
            {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <div style={lbl}>Başlangıç</div>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={inp} />
        </div>
        <div>
          <div style={lbl}>Bitiş</div>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={inp} />
        </div>
        <button onClick={() => { setFilterType(""); setFilterFrom(""); setFilterTo(""); }} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, cursor: "pointer" }}>
          Temizle
        </button>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontWeight: 800, fontSize: 14 }}>
          İşlem Kayıtları
          <span style={{ marginLeft: 10, fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{total} kayıt</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Kayıt bulunamadı.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#faf5ff" }}>
                  {["Tarih/Saat","Kullanıcı","İşlem","Varlık","Açıklama","IP"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={l.id} style={{ borderTop: i === 0 ? "none" : "1px solid #f8fafc" }}>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{new Date(l.createdAtUtc).toLocaleString("tr-TR")}</td>
                    <td style={{ padding: "10px 16px", fontWeight: 600 }}>{l.userName ?? "Sistem"}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: (actionColor[l.action] ?? "#94a3b8") + "22", color: actionColor[l.action] ?? "#64748b" }}>
                        {l.action}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "#64748b" }}>{l.entityType}</td>
                    <td style={{ padding: "10px 16px", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.description}</td>
                    <td style={{ padding: "10px 16px", fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{l.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > 50 && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8, justifyContent: "center" }}>
            {Array.from({ length: Math.min(Math.ceil(total / 50), 10) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid", borderColor: page === p ? "#7c3aed" : "#e2e8f0", background: page === p ? "#7c3aed" : "#fff", color: page === p ? "#fff" : "#344054", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{p}</button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 };
const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", outline: "none" };
const sel: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, background: "#fff", outline: "none" };
