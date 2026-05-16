"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

type Settings = { isActive: boolean; phoneNumberId?: string; fromNumber?: string; hasToken: boolean };
type Log = { id: string; toNumber: string; messageBody: string; status: string; customerName?: string; sentByName?: string; messageType?: string; errorDetail?: string; createdAtUtc: string };
type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

const statusColor: Record<string, string> = { sent: "#16a34a", failed: "#dc2626", pending: "#d97706" };

export default function WhatsAppPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"settings"|"logs">("settings");

  // Settings state
  const [settings,     setSettings]     = useState<Settings | null>(null);
  const [isActive,     setIsActive]     = useState(false);
  const [apiToken,     setApiToken]     = useState("");
  const [phoneNumId,   setPhoneNumId]   = useState("");
  const [fromNumber,   setFromNumber]   = useState("");
  const [saving,       setSaving]       = useState(false);

  // Logs state
  const [logs,    setLogs]    = useState<Log[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);

  const loadSettings = useCallback(async () => {
    const r = await apiFetch("/WhatsApp/settings");
    if (r.ok) {
      const d: Settings = await r.json();
      setSettings(d);
      setIsActive(d.isActive);
      setPhoneNumId(d.phoneNumberId ?? "");
      setFromNumber(d.fromNumber ?? "");
    }
  }, []);

  const loadLogs = useCallback(async (p: number) => {
    setLoading(true);
    const r = await apiFetch(`/WhatsApp/logs?page=${p}&pageSize=30`);
    if (r.ok) { const d: Paged<Log> = await r.json(); setLogs(d.items); setTotal(d.total); }
    setLoading(false);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { if (tab === "logs") loadLogs(page); }, [tab, page, loadLogs]);

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const r = await apiFetch("/WhatsApp/settings", {
      method: "PUT",
      body: JSON.stringify({ isActive, apiToken: apiToken || undefined, phoneNumberId: phoneNumId || undefined, fromNumber: fromNumber || undefined }),
    });
    setSaving(false);
    if (r.ok) { setApiToken(""); loadSettings(); toast.success("Ayarlar kaydedildi."); }
    else toast.error("Kaydedilemedi.");
  };

  return (
    <AppShell title="WhatsApp Entegrasyonu">
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #f1f5f9" }}>
        {([["settings","⚙️ Ayarlar"],["logs","📋 Mesaj Geçmişi"]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "10px 20px", border: "none", background: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 14,
            color: tab === k ? "#7c3aed" : "#64748b",
            borderBottom: tab === k ? "2px solid #7c3aed" : "2px solid transparent",
            marginBottom: -2,
          }}>{lbl}</button>
        ))}
      </div>

      {tab === "settings" && (
        <div style={{ maxWidth: 560 }}>
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#92400e" }}>
            ⚠️ WhatsApp Business API (Meta) entegrasyonu gerektirir. API Token'ınızı Meta Developer Console'dan alın.
          </div>
          <form onSubmit={saveSettings} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e9d5ff", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: 18, height: 18, accentColor: "#7c3aed" }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>WhatsApp Entegrasyonu Aktif</span>
            </label>

            <div>
              <label style={lbl}>Phone Number ID</label>
              <input value={phoneNumId} onChange={e => setPhoneNumId(e.target.value)} placeholder="Meta'dan alınan Phone Number ID" style={inp} />
            </div>
            <div>
              <label style={lbl}>Gönderen Numara</label>
              <input value={fromNumber} onChange={e => setFromNumber(e.target.value)} placeholder="+905xxxxxxxxx" style={inp} />
            </div>
            <div>
              <label style={lbl}>API Token {settings?.hasToken && <span style={{ color: "#16a34a", fontSize: 11 }}>✓ Mevcut token var</span>}</label>
              <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)}
                placeholder={settings?.hasToken ? "Değiştirmek için yeni token girin" : "Meta API Token"}
                style={inp} />
            </div>

            <button type="submit" disabled={saving} style={{ padding: "11px", borderRadius: 12, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
              {saving ? "Kaydediliyor..." : "💾 Ayarları Kaydet"}
            </button>
          </form>
        </div>
      )}

      {tab === "logs" && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontWeight: 800, fontSize: 14 }}>
            Mesaj Geçmişi
            <span style={{ marginLeft: 10, fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{total} kayıt</span>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Mesaj geçmişi bulunamadı.</div>
          ) : (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
              <thead>
                <tr style={{ background: "#faf5ff" }}>
                  {["Tarih","Numara","Müşteri","Tip","Mesaj","Durum"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={l.id} style={{ borderTop: i === 0 ? "none" : "1px solid #f8fafc" }}>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{new Date(l.createdAtUtc).toLocaleString("tr-TR")}</td>
                    <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12 }}>{l.toNumber}</td>
                    <td style={{ padding: "10px 16px" }}>{l.customerName ?? "—"}</td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "#64748b" }}>{l.messageType ?? "—"}</td>
                    <td style={{ padding: "10px 16px", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{l.messageBody}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: (statusColor[l.status] ?? "#94a3b8") + "22", color: statusColor[l.status] ?? "#64748b" }}>
                        {l.status === "sent" ? "Gönderildi" : l.status === "failed" ? "Hatalı" : "Bekliyor"}
                      </span>
                      {l.errorDetail && <div style={{ fontSize: 10, color: "#dc2626", marginTop: 2 }}>{l.errorDetail}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          {total > 30 && (
            <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8, justifyContent: "center" }}>
              {Array.from({ length: Math.min(Math.ceil(total / 30), 10) }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid", borderColor: page === p ? "#7c3aed" : "#e2e8f0", background: page === p ? "#7c3aed" : "#fff", color: page === p ? "#fff" : "#344054", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{p}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 5 };
const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" };
