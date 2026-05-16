"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

type WaitlistEntry = {
  id: string; customerId?: string;
  customerName: string; customerFirstName?: string; customerLastName?: string;
  customerPhone?: string; customerEmail?: string;
  stylistId?: string; stylistName?: string; serviceName?: string;
  preferredDate?: string; preferredTimeFrom?: string; preferredTimeTo?: string;
  notes?: string; status: string; createdAtUtc: string; source?: string;
};
type Customer = { id: string; firstName: string; lastName: string; phone?: string };
type Stylist  = { id: string; fullName: string };
type Service  = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = { Waiting: "Bekliyor", Notified: "Bildirildi", Booked: "Onaylandı", Cancelled: "İptal" };
const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  Waiting:   { bg: "#ede9fe", text: "#7c3aed" },
  Notified:  { bg: "#fef3c7", text: "#92400e" },
  Booked:    { bg: "#dcfce7", text: "#166534" },
  Cancelled: { bg: "#f1f5f9", text: "#64748b" },
};

// ── Onayla Modal ──────────────────────────────────────────────────────────────
function ApproveModal({ entry, onClose, onDone }: {
  entry: WaitlistEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTime, setProposedTime] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const hasPhone = !!entry.customerPhone;
  const hasEmail = !!entry.customerEmail;

  const toggleChannel = (ch: string) =>
    setChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);

  const approve = async () => {
    setBusy(true);
    const r = await apiFetch(`/Waitlist/${entry.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        proposedDate: proposedDate
          ? new Date(proposedDate).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long", year: "numeric" })
          : undefined,
        proposedTime: proposedTime || undefined,
        channels,
      }),
    });
    setBusy(false);
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      const warnings: string[] = d.warnings ?? [];
      if (warnings.length > 0) toast.warning(`Onaylandı, ancak: ${warnings.join("; ")}`);
      else toast.success("Onaylandı ve bildirim gönderildi.");
      onDone();
    } else {
      toast.error(d.message ?? "Bir hata oluştu.");
    }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 700 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(540px, calc(100vw - 32px))", maxHeight: "90vh", overflowY: "auto",
        background: "#fff", borderRadius: 18, boxShadow: "0 16px 64px rgba(15,23,42,0.2)",
        zIndex: 701, padding: 28,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Bekleme Talebini Onayla</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#94a3b8", lineHeight: 1 }}>×</button>
        </div>

        {/* Customer info */}
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 6 }}>{entry.customerName}</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#64748b" }}>
            {entry.customerPhone && <span>📞 {entry.customerPhone}</span>}
            {entry.customerEmail && <span>✉️ {entry.customerEmail}</span>}
            {entry.serviceName   && <span>✂️ {entry.serviceName}</span>}
            {entry.stylistName   && <span>👤 {entry.stylistName}</span>}
            {entry.preferredDate && (
              <span>
                📅 {new Date(entry.preferredDate).toLocaleDateString("tr-TR")}
                {entry.preferredTimeFrom && entry.preferredTimeTo
                  ? ` · ⏰ ${entry.preferredTimeFrom}–${entry.preferredTimeTo}`
                  : entry.preferredTimeFrom
                  ? ` · ⏰ ${entry.preferredTimeFrom} sonrası`
                  : " · Tüm gün"}
              </span>
            )}
          </div>
        </div>

        {/* Propose a time */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#0f172a" }}>Önerilen Randevu Saati</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl}>Tarih</label>
              <input type="date" value={proposedDate} onChange={e => setProposedDate(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Saat</label>
              <input type="time" value={proposedTime} onChange={e => setProposedTime(e.target.value)} style={inp} />
            </div>
          </div>
          {!proposedDate && !proposedTime && (
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>Tarih/saat belirtmezseniz bildirim yine de gönderilir, sadece öneri içermez.</p>
          )}
        </div>

        {/* Notification channels */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#0f172a" }}>Bildirim Kanalları</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { key: "whatsapp", label: "💬 WhatsApp", available: hasPhone, reason: "Telefon numarası yok" },
              { key: "email",    label: "✉️ E-posta",  available: hasEmail, reason: "E-posta adresi yok" },
              { key: "sms",      label: "📱 SMS",       available: hasPhone, reason: "Telefon numarası yok" },
            ].map(ch => (
              <label key={ch.key} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10,
                border: `1.5px solid ${channels.includes(ch.key) ? "#7c3aed" : "#e2e8f0"}`,
                background: channels.includes(ch.key) ? "#faf5ff" : "#fff",
                cursor: ch.available ? "pointer" : "not-allowed",
                opacity: ch.available ? 1 : 0.45,
              }}>
                <input
                  type="checkbox"
                  checked={channels.includes(ch.key)}
                  onChange={() => ch.available && toggleChannel(ch.key)}
                  disabled={!ch.available}
                  style={{ accentColor: "#7c3aed", width: 16, height: 16 }}
                />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{ch.label}</span>
                {!ch.available && <span style={{ fontSize: 11, color: "#94a3b8" }}>{ch.reason}</span>}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            İptal
          </button>
          <button onClick={approve} disabled={busy}
            style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: busy ? 0.7 : 1 }}>
            {busy ? "İşleniyor..." : channels.length > 0 ? "Onayla ve Bildir" : "Sadece Onayla"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Notify Modal (bildirim gönder, onaylamadan) ───────────────────────────────
function NotifyModal({ entry, onClose, onDone }: {
  entry: WaitlistEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [channel, setChannel]       = useState("whatsapp");
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTime, setProposedTime] = useState("");
  const [busy, setBusy] = useState(false);

  const hasPhone = !!entry.customerPhone;
  const hasEmail = !!entry.customerEmail;

  const send = async () => {
    setBusy(true);
    const r = await apiFetch(`/Waitlist/${entry.id}/notify`, {
      method: "POST",
      body: JSON.stringify({
        channel,
        proposedDate: proposedDate
          ? new Date(proposedDate).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long", year: "numeric" })
          : undefined,
        proposedTime: proposedTime || undefined,
      }),
    });
    setBusy(false);
    const d = await r.json().catch(() => ({}));
    if (r.ok) { toast.success("Bildirim gönderildi."); onDone(); }
    else toast.error(d.message ?? "Gönderilemedi.");
  };

  const channels = [
    { key: "whatsapp", label: "💬 WhatsApp", available: hasPhone },
    { key: "email",    label: "✉️ E-posta",  available: hasEmail },
    { key: "sms",      label: "📱 SMS",       available: hasPhone },
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 700 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(460px, calc(100vw - 32px))",
        background: "#fff", borderRadius: 18, boxShadow: "0 16px 64px rgba(15,23,42,0.2)",
        zIndex: 701, padding: 24,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Bildirim Gönder — {entry.customerName}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#94a3b8", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>Kanal</div>
          <div style={{ display: "flex", gap: 8 }}>
            {channels.map(ch => (
              <button key={ch.key} onClick={() => ch.available && setChannel(ch.key)} disabled={!ch.available}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 10, border: `1.5px solid ${channel === ch.key ? "#7c3aed" : "#e2e8f0"}`,
                  background: channel === ch.key ? "#faf5ff" : "#fff",
                  fontWeight: 700, fontSize: 12, cursor: ch.available ? "pointer" : "not-allowed",
                  opacity: ch.available ? 1 : 0.4, color: channel === ch.key ? "#7c3aed" : "#64748b",
                }}>
                {ch.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <div>
            <label style={lbl}>Önerilen Tarih</label>
            <input type="date" value={proposedDate} onChange={e => setProposedDate(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Önerilen Saat</label>
            <input type="time" value={proposedTime} onChange={e => setProposedTime(e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>İptal</button>
          <button onClick={send} disabled={busy}
            style={{ flex: 2, padding: "10px 0", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Gönderiliyor..." : "Gönder"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────
export default function BeklemePage() {
  const { toast, confirm } = useToast();
  const [entries,   setEntries]   = useState<WaitlistEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stylists,  setStylists]  = useState<Stylist[]>([]);
  const [services,  setServices]  = useState<Service[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [filter,    setFilter]    = useState("Waiting");

  const [approveEntry, setApproveEntry] = useState<WaitlistEntry | null>(null);
  const [notifyEntry,  setNotifyEntry]  = useState<WaitlistEntry | null>(null);

  // Form state (panel — linked customer)
  const [fCustomer,  setFCustomer]  = useState("");
  const [fStylist,   setFStylist]   = useState("");
  const [fService,   setFService]   = useState("");
  const [fDate,      setFDate]      = useState("");
  const [fTimeType,  setFTimeType]  = useState<"flexible"|"specific">("flexible");
  const [fTimeFrom,  setFTimeFrom]  = useState("09:00");
  const [fTimeTo,    setFTimeTo]    = useState("11:00");
  const [fNotes,     setFNotes]     = useState("");
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [e, c, s, sv] = await Promise.all([
      apiFetch(`/Waitlist${filter ? `?status=${filter}` : ""}`).then(r => r.ok ? r.json() : []),
      apiFetch("/Customers?pageSize=200").then(r => r.ok ? r.json() : { items: [] }).then(d => d.items ?? d),
      apiFetch("/Stylists").then(r => r.ok ? r.json() : []),
      apiFetch("/Services").then(r => r.ok ? r.json() : []),
    ]);
    setEntries(e); setCustomers(c); setStylists(s); setServices(sv);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fCustomer) { toast.error("Müşteri seçin."); return; }
    setSaving(true);
    const r = await apiFetch("/Waitlist", {
      method: "POST",
      body: JSON.stringify({
        customerId:        fCustomer,
        stylistId:         fStylist || undefined,
        serviceName:       fService || undefined,
        preferredDate:     fDate ? new Date(fDate).toISOString() : undefined,
        preferredTimeFrom: fTimeType === "specific" ? fTimeFrom : undefined,
        preferredTimeTo:   fTimeType === "specific" ? fTimeTo   : undefined,
        notes:             fNotes || undefined,
      }),
    });
    setSaving(false);
    if (r.ok) {
      toast.success("Bekleme listesine eklendi.");
      setShowForm(false); setFCustomer(""); setFStylist(""); setFService(""); setFDate(""); setFTimeType("flexible"); setFTimeFrom("09:00"); setFTimeTo("11:00"); setFNotes("");
      load();
    } else { toast.error("Eklenemedi."); }
  };

  const remove = async (id: string) => {
    if (!await confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;
    const r = await apiFetch(`/Waitlist/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Silindi."); load(); }
    else toast.error("Silinemedi.");
  };

  const waiting  = entries.filter(e => e.status === "Waiting").length;
  const notified = entries.filter(e => e.status === "Notified").length;

  return (
    <AppShell
      title="Bekleme Listesi"
      description="Doldurulan slotlar için müşteri kuyruğu"
      actions={
        <button onClick={() => setShowForm(true)}
          style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Listeye Ekle
        </button>
      }
    >
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Bekleyen", value: waiting, color: "#7c3aed", bg: "#ede9fe" },
          { label: "Bildirildi", value: notified, color: "#92400e", bg: "#fef3c7" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: "14px 24px", minWidth: 120 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: s.color, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(["Waiting", "Notified", "Booked", "Cancelled", ""] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`btn ${filter === f ? "btn-primary" : "btn-ghost"}`}
            style={{ padding: "7px 14px", minHeight: 36, fontSize: 12 }}>
            {f === "" ? "Tümü" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={create} style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Bekleme Listesine Ekle</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Müşteri *</label>
              <select value={fCustomer} onChange={e => setFCustomer(e.target.value)} required style={inp}>
                <option value="">Seçin...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.phone ? ` — ${c.phone}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Stilist (isteğe bağlı)</label>
              <select value={fStylist} onChange={e => setFStylist(e.target.value)} style={inp}>
                <option value="">Farklı değil</option>
                {stylists.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Hizmet (isteğe bağlı)</label>
              <select value={fService} onChange={e => setFService(e.target.value)} style={inp}>
                <option value="">Farklı değil</option>
                {services.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Tercih Edilen Tarih (isteğe bağlı)</label>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={inp} />
            </div>
          </div>
          {/* Time preference */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Saat Tercihi</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {(["flexible", "specific"] as const).map(opt => (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${fTimeType === opt ? "#7c3aed" : "#e2e8f0"}`, background: fTimeType === opt ? "#faf5ff" : "#fff", fontSize: 12, fontWeight: 700 }}>
                  <input type="radio" name="fTimeType" value={opt} checked={fTimeType === opt} onChange={() => setFTimeType(opt)} style={{ accentColor: "#7c3aed" }} />
                  {opt === "flexible" ? "🕐 Tüm gün uygun" : "🎯 Belirli saat aralığı"}
                </label>
              ))}
            </div>
            {fTimeType === "specific" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Başlangıç</label>
                  <input type="time" value={fTimeFrom} onChange={e => setFTimeFrom(e.target.value)} style={inp} />
                </div>
                <div style={{ paddingTop: 20, color: "#94a3b8", fontWeight: 700 }}>—</div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Bitiş</label>
                  <input type="time" value={fTimeTo} onChange={e => setFTimeTo(e.target.value)} style={inp} />
                </div>
              </div>
            )}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Not (isteğe bağlı)</label>
            <input value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Özel istek veya not..." style={inp} />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>İptal</button>
            <button type="submit" disabled={saving} style={{ padding: "9px 24px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {saving ? "Ekleniyor..." : "Listeye Ekle"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
      ) : entries.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", background: "#fafafa", borderRadius: 12, border: "1px dashed #e2e8f0" }}>
          Bekleme listesi boş.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entries.map(e => {
            const sc = STATUS_COLOR[e.status] ?? { bg: "#f1f5f9", text: "#64748b" };
            return (
              <div key={e.id} style={{ background: "#fff", border: "1px solid #f1f5f9", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: "#0f172a" }}>{e.customerName}</span>
                      {e.source === "public" && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "#ede9fe", color: "#7c3aed" }}>Online</span>
                      )}
                      {!e.customerId && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: "#fef3c7", color: "#92400e" }}>Müşteri Kaydı Yok</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {e.customerPhone && <span>📞 {e.customerPhone}</span>}
                      {e.customerEmail && <span>✉️ {e.customerEmail}</span>}
                      {e.serviceName   && <span>✂️ {e.serviceName}</span>}
                      {e.stylistName   && <span>👤 {e.stylistName}</span>}
                      {e.preferredDate && (
                        <span>
                          📅 {new Date(e.preferredDate).toLocaleDateString("tr-TR")}
                          {e.preferredTimeFrom && e.preferredTimeTo
                            ? ` · ⏰ ${e.preferredTimeFrom}–${e.preferredTimeTo}`
                            : e.preferredTimeFrom
                            ? ` · ⏰ ${e.preferredTimeFrom} sonrası`
                            : " · Tüm gün"}
                        </span>
                      )}
                      {e.notes && <span>💬 {e.notes}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{new Date(e.createdAtUtc).toLocaleDateString("tr-TR")} tarihinde eklendi</div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.text }}>
                      {STATUS_LABEL[e.status] ?? e.status}
                    </span>

                    {/* Onayla — only for Waiting/Notified */}
                    {(e.status === "Waiting" || e.status === "Notified") && (
                      <button
                        onClick={() => setApproveEntry(e)}
                        style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#dcfce7", color: "#166534", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        ✅ Onayla
                      </button>
                    )}

                    {/* Bildirim gönder — Waiting/Notified */}
                    {(e.status === "Waiting" || e.status === "Notified") && (
                      <button
                        onClick={() => setNotifyEntry(e)}
                        style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#ede9fe", color: "#7c3aed", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        📣 Bildir
                      </button>
                    )}

                    <button onClick={() => remove(e.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#fef2f2", color: "#b42318", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Sil</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {approveEntry && (
        <ApproveModal
          entry={approveEntry}
          onClose={() => setApproveEntry(null)}
          onDone={() => { setApproveEntry(null); load(); }}
        />
      )}
      {notifyEntry && (
        <NotifyModal
          entry={notifyEntry}
          onClose={() => setNotifyEntry(null)}
          onDone={() => { setNotifyEntry(null); load(); }}
        />
      )}
    </AppShell>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 };
const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };
