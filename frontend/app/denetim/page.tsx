"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type Log = {
  id: string; userName?: string; entityType: string; entityId: string;
  action: string; description: string; ipAddress?: string; createdAtUtc: string;
};
type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };
type Stats = {
  total: number; todayCount: number; weekCount: number;
  actionCounts: { action: string; count: number }[];
  topEntities:  { entity: string; count: number }[];
};

const ACTION_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  Create:       { bg: "#dcfce7", text: "#16a34a", label: "Oluşturma"     },
  Update:       { bg: "#dbeafe", text: "#2563eb", label: "Güncelleme"    },
  Delete:       { bg: "#fee2e2", text: "#dc2626", label: "Silme"         },
  Login:        { bg: "#fef3c7", text: "#d97706", label: "Giriş"         },
  GoogleLogin:  { bg: "#fef3c7", text: "#d97706", label: "Google Giriş"  },
  StatusChange: { bg: "#f3e8ff", text: "#7c3aed", label: "Durum Değişim" },
  StockMovement:{ bg: "#e0f2fe", text: "#0369a1", label: "Stok Hareketi" },
  Checkout:     { bg: "#dcfce7", text: "#16a34a", label: "Kasa"          },
};

const ENTITY_LABELS: Record<string, string> = {
  Appointment:    "Randevu",
  Service:        "Hizmet",
  Customer:       "Müşteri",
  Stylist:        "Stilist",
  StockItem:      "Stok",
  User:           "Kullanıcı",
  Salon:          "Salon",
  BankAccount:    "Banka Hesabı",
  Task:           "Görev",
  Invoice:        "Fatura",
  PosTransaction: "Kasa",
};

const PAGE_SIZE = 50;

export default function DenetimPage() {
  const [logs,         setLogs]         = useState<Log[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [loading,      setLoading]      = useState(false);
  const [entityTypes,  setEntityTypes]  = useState<string[]>([]);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [filterType,   setFilterType]   = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterFrom,   setFilterFrom]   = useState("");
  const [filterTo,     setFilterTo]     = useState("");
  const [search,       setSearch]       = useState("");
  const [expandedId,   setExpandedId]   = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
    if (filterType)   params.set("entityType", filterType);
    if (filterAction) params.set("action",     filterAction);
    if (filterFrom)   params.set("from",       filterFrom);
    if (filterTo)     params.set("to",         filterTo);
    const r = await apiFetch(`/AuditLog?${params}`);
    if (r.ok) { const d: Paged<Log> = await r.json(); setLogs(d.items); setTotal(d.total); }
    setLoading(false);
  }, [filterType, filterAction, filterFrom, filterTo]);

  useEffect(() => {
    apiFetch("/AuditLog/entity-types").then(r => r.ok ? r.json() : []).then(setEntityTypes);
    apiFetch("/AuditLog/stats").then(r => r.ok ? r.json() : null).then(setStats);
  }, []);

  useEffect(() => { setPage(1); }, [filterType, filterAction, filterFrom, filterTo]);
  useEffect(() => { load(page); }, [load, page]);

  const filtered = search.trim()
    ? logs.filter(l =>
        l.description.toLowerCase().includes(search.toLowerCase()) ||
        (l.userName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        l.entityType.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const clearFilters = () => {
    setFilterType(""); setFilterAction(""); setFilterFrom(""); setFilterTo(""); setSearch("");
  };

  return (
    <AppShell title="Denetim Günlüğü">

      {/* ── Stats bar ── */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
          {([
            ["Toplam Kayıt", stats.total.toLocaleString("tr-TR"),      "#7c3aed"],
            ["Bu Hafta",     stats.weekCount.toLocaleString("tr-TR"),   "#2563eb"],
            ["Bugün",        stats.todayCount.toLocaleString("tr-TR"),  "#16a34a"],
          ] as [string, string, string][]).map(([lbl, val, color]) => (
            <div key={lbl} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #f1f5f9", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, marginBottom: 4 }}>{lbl}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color }}>{val}</div>
            </div>
          ))}
          {stats.actionCounts.slice(0, 4).map(({ action, count }) => {
            const c = ACTION_STYLE[action];
            const active = filterAction === action;
            return (
              <div key={action} onClick={() => setFilterAction(active ? "" : action)} style={{
                background: active ? (c?.bg ?? "#f8fafc") : "#fff",
                borderRadius: 12, padding: "14px 16px",
                border: `1px solid ${active ? (c?.text ?? "#7c3aed") + "55" : "#f1f5f9"}`,
                cursor: "pointer", transition: "all 0.12s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, marginBottom: 4 }}>{c?.label ?? action}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: c?.text ?? "#64748b" }}>{count.toLocaleString("tr-TR")}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={lbl}>Varlık Tipi</div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={sel}>
            <option value="">Tümü</option>
            {entityTypes.map(t => <option key={t} value={t}>{ENTITY_LABELS[t] ?? t}</option>)}
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
        <div>
          <div style={lbl}>Metin Ara</div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Kullanıcı veya açıklama..." style={{ ...inp, width: 220 }} />
        </div>
        <button onClick={clearFilters} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, cursor: "pointer" }}>
          Temizle
        </button>
      </div>

      {/* ── Action chips ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {(["", ...Object.keys(ACTION_STYLE).filter(k => k !== "")]).map(a => {
          const c = ACTION_STYLE[a];
          const active = filterAction === a;
          return (
            <button key={a} onClick={() => setFilterAction(a)} style={{
              padding: "5px 14px", borderRadius: 999, border: "1px solid", fontSize: 12, fontWeight: 700, cursor: "pointer",
              borderColor: active ? (c?.text ?? "#7c3aed") : "#e2e8f0",
              background:  active ? (c?.bg  ?? "#f5f3ff") : "#fff",
              color:       active ? (c?.text ?? "#7c3aed") : "#64748b",
            }}>
              {a === "" ? "Tümü" : (c?.label ?? a)}
            </button>
          );
        })}
      </div>

      {/* ── Table ── */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontWeight: 800, fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>İşlem Kayıtları</span>
          <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>
            {search.trim() ? `${filtered.length} / ${total}` : total} kayıt
          </span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <div>Kayıt bulunamadı.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#faf5ff" }}>
                  {["Tarih / Saat","Kullanıcı","İşlem","Varlık","Açıklama","IP"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => {
                  const c       = ACTION_STYLE[l.action];
                  const expanded = expandedId === l.id;
                  return (
                    <>
                      <tr key={l.id}
                        onClick={() => setExpandedId(expanded ? null : l.id)}
                        style={{ borderTop: i === 0 ? "none" : "1px solid #f8fafc", cursor: "pointer", background: expanded ? "#faf5ff" : "transparent" }}
                        onMouseOver={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = "#faf5ff"; }}
                        onMouseOut={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        <td style={{ padding: "10px 16px", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                          {new Date(l.createdAtUtc).toLocaleString("tr-TR")}
                        </td>
                        <td style={{ padding: "10px 16px", fontWeight: 600 }}>
                          {l.userName ?? <span style={{ color: "#94a3b8" }}>Sistem</span>}
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: c?.bg ?? "#f1f5f9", color: c?.text ?? "#64748b" }}>
                            {c?.label ?? l.action}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", fontSize: 12, color: "#64748b" }}>
                          {ENTITY_LABELS[l.entityType] ?? l.entityType}
                        </td>
                        <td style={{ padding: "10px 16px", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {l.description}
                        </td>
                        <td style={{ padding: "10px 16px", fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                          {l.ipAddress ?? "—"}
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${l.id}-exp`} style={{ background: "#f8fafc" }}>
                          <td colSpan={6} style={{ padding: "12px 20px 16px" }}>
                            <div style={{ fontSize: 12, color: "#0f172a", marginBottom: 8, lineHeight: 1.6 }}>
                              <strong>Açıklama:</strong> {l.description}
                            </div>
                            <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                              <span>
                                <strong>Varlık:</strong>{" "}
                                <span style={{ color: "#64748b" }}>{ENTITY_LABELS[l.entityType] ?? l.entityType}</span>
                              </span>
                              <span>
                                <strong>ID:</strong>{" "}
                                <code style={{ fontFamily: "monospace", background: "#e2e8f0", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>{l.entityId}</code>
                              </span>
                              {l.ipAddress && (
                                <span><strong>IP:</strong> <code style={{ fontFamily: "monospace" }}>{l.ipAddress}</code></span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: page === 1 ? "not-allowed" : "pointer", color: page === 1 ? "#cbd5e1" : "#344054", fontWeight: 700 }}>
              ←
            </button>
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} style={{
                width: 32, height: 32, borderRadius: 8, border: "1px solid",
                borderColor: page === p ? "#7c3aed" : "#e2e8f0",
                background:  page === p ? "#7c3aed" : "#fff",
                color:       page === p ? "#fff"    : "#344054",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}>{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: page === totalPages ? "not-allowed" : "pointer", color: page === totalPages ? "#cbd5e1" : "#344054", fontWeight: 700 }}>
              →
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 };
const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", outline: "none" };
const sel: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, background: "#fff", outline: "none" };
