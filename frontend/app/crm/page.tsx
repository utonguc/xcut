"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

/* ── Types ─────────────────────────────────────────────────────────────────── */
type Customer = { id: string; fullName: string; email?: string; phone?: string; customerStatus: string; birthDate?: string; createdAtUtc: string };
type WaLog    = { id: string; toNumber: string; messageBody: string; status: string; customerName?: string; sentByName?: string; messageType?: string; errorDetail?: string; createdAtUtc: string };
type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

type MailTemplate = { id: string; name: string; subject: string; body: string };

type SurveyQuestion = { id: string; sortOrder: number; text: string; type: string; options?: string; isRequired: boolean };
type SurveyListItem = { id: string; title: string; description?: string; status: string; questionCount: number; responseCount: number; avgRating?: number; createdAtUtc: string };
type SurveyDetail   = SurveyListItem & { questions: SurveyQuestion[] };
type SurveyAnswerItem = { questionText: string; questionType: string; value?: string };
type SurveyResponse   = { id: string; customerName?: string; email?: string; ratingAvg?: number; submittedAtUtc: string; answers: SurveyAnswerItem[] };
type QuestionStat     = { questionId: string; questionText: string; questionType: string; avgValue?: number; valueCounts: Record<string, number> };
type SurveyStats      = { totalResponses: number; avgRating?: number; positive: number; neutral: number; negative: number; questionStats: QuestionStat[] };

type QuestionForm = { text: string; type: string; options: string; isRequired: boolean };

const QUESTION_TYPES = [
  { value: "rating",  label: "⭐ Puan (1-5)" },
  { value: "yesno",   label: "✓ Evet / Hayır" },
  { value: "choice",  label: "☑ Çoktan Seçmeli" },
  { value: "text",    label: "✏️ Serbest Metin" },
];

const SURVEY_PUBLIC_BASE = "https://xcut.xshield.com.tr/survey";

const STATUS_COLORS: Record<string, string> = { Yeni: "#7c3aed", Aktif: "#16a34a", VIP: "#d97706", Pasif: "#94a3b8", "Randevu Var": "#1d4ed8" };
const WA_STATUS: Record<string, string> = { sent: "#16a34a", failed: "#dc2626", pending: "#d97706" };

/* ═══════════════════════════════════════════════════════════════════════════
   MAIL ŞABLONLARI TAB
   ═══════════════════════════════════════════════════════════════════════════ */
const DEFAULT_TEMPLATES: MailTemplate[] = [
  { id: "birthday",  name: "Doğum Günü",     subject: "Doğum Günün Kutlu Olsun!", body: "Merhaba {{ad}},\n\nDoğum günün kutlu olsun! {{salon}} olarak en içten dileklerimizi sunuyoruz.\n\nSevgilerle,\n{{salon}}" },
  { id: "winback",   name: "Geri Kazan",      subject: "Sizi Özledik!",            body: "Merhaba {{ad}},\n\nBir süredir göremiyoruz. {{salon}} ailesi olarak sizi tekrar aramızda görmek isteriz!\n\nRandevu almak için bizi arayın.\n\n{{salon}}" },
  { id: "reminder",  name: "Randevu Hatırl.", subject: "Randevunuz Yaklaşıyor",    body: "Merhaba {{ad}},\n\n{{tarih}} tarihindeki randevunuzu hatırlatmak istedik.\n\nGörüşmek üzere,\n{{salon}}" },
  { id: "welcome",   name: "Hoş Geldiniz",   subject: "Hoş Geldiniz!",            body: "Merhaba {{ad}},\n\n{{salon}}'e hoş geldiniz! Sizi aramızda görmekten mutluluk duyuyoruz.\n\n{{salon}}" },
];

function MailSablonlariTab() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<MailTemplate[]>(() => {
    if (typeof window === "undefined") return DEFAULT_TEMPLATES;
    try { return JSON.parse(localStorage.getItem("crm_mail_templates") ?? "null") ?? DEFAULT_TEMPLATES; } catch { return DEFAULT_TEMPLATES; }
  });
  const [editing, setEditing] = useState<MailTemplate | null>(null);
  const [form,    setForm]    = useState({ name: "", subject: "", body: "" });

  const save = () => {
    if (!form.name || !form.subject || !form.body) { toast.error("Tüm alanları doldurun."); return; }
    const updated = editing
      ? templates.map(t => t.id === editing.id ? { ...editing, ...form } : t)
      : [...templates, { id: Date.now().toString(), ...form }];
    setTemplates(updated);
    localStorage.setItem("crm_mail_templates", JSON.stringify(updated));
    setEditing(null);
    setForm({ name: "", subject: "", body: "" });
    toast.success("Şablon kaydedildi.");
  };

  const del = (id: string) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    localStorage.setItem("crm_mail_templates", JSON.stringify(updated));
  };

  const startEdit = (t: MailTemplate) => {
    setEditing(t);
    setForm({ name: t.name, subject: t.subject, body: t.body });
  };

  const startNew = () => { setEditing(null); setForm({ name: "", subject: "", body: "" }); };

  const inp: React.CSSProperties = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
      <div style={{ flex: "1 1 260px", maxWidth: 320 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#344054" }}>Şablonlar ({templates.length})</div>
          <button onClick={startNew} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Yeni</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map(t => (
            <div key={t.id} style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${editing?.id === t.id ? "#7c3aed" : "#e4e7ec"}`, background: editing?.id === t.id ? "#faf5ff" : "#fff", cursor: "pointer" }}
              onClick={() => startEdit(t)}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <button onClick={e => { e.stopPropagation(); del(t.id); }} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Sil</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: "2 1 300px", background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", padding: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>{editing ? "Şablonu Düzenle" : "Yeni Şablon"}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Şablon Adı</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={inp} placeholder="Doğum Günü, Hatırlatma..." /></div>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>E-posta Konusu</label>
            <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} style={inp} placeholder="Konu satırı..." /></div>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>İçerik <span style={{ color: "#94a3b8" }}>— Değişkenler: {"{{ad}}"}, {"{{salon}}"}, {"{{tarih}}"}</span></label>
            <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={10} style={{ ...inp, resize: "vertical" }} placeholder="Merhaba {{ad}}, ..." /></div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            {editing && <button onClick={startNew} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid #e4e7ec", background: "#fff", fontSize: 13, cursor: "pointer" }}>Yeni</button>}
            <button onClick={save} style={{ padding: "9px 24px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Kaydet</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOPLU MAİL TAB
   ═══════════════════════════════════════════════════════════════════════════ */
function TopluMailTab() {
  const { toast } = useToast();
  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState("all");
  const [templates,  setTemplates]  = useState<MailTemplate[]>(DEFAULT_TEMPLATES);
  const [tplId,      setTplId]      = useState("");
  const [customSubj, setCustomSubj] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [sending,    setSending]    = useState(false);
  const [progress,   setProgress]   = useState({ done: 0, total: 0 });
  const [search,     setSearch]     = useState("");
  const [salonName,  setSalonName]  = useState("");

  useEffect(() => {
    apiFetch("/Auth/me").then(r => r.ok ? r.json() : null).then(d => { if (d?.salonName) setSalonName(d.salonName); });
    try { const t = JSON.parse(localStorage.getItem("crm_mail_templates") ?? "null"); if (t) setTemplates(t); } catch { /* ignore */ }
    apiFetch("/Customers?pageSize=1000").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setCustomers(d.items ?? d);
      setLoading(false);
    });
  }, []);

  const filtered = customers.filter(c => {
    if (statusFilter !== "all" && c.customerStatus !== statusFilter) return false;
    if (search && !c.fullName.toLowerCase().includes(search.toLowerCase()) && !(c.email ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const withEmail = filtered.filter(c => c.email);
  const toggleAll = () => {
    if (selected.size === withEmail.length) setSelected(new Set());
    else setSelected(new Set(withEmail.map(c => c.id)));
  };

  const sendBulk = async () => {
    const tpl = templates.find(t => t.id === tplId);
    const subject = tpl?.subject ?? customSubj;
    const body    = tpl?.body    ?? customBody;
    if (!subject || !body) { toast.error("Konu ve içerik zorunludur."); return; }
    if (selected.size === 0) { toast.error("En az bir alıcı seçin."); return; }

    const recipients = customers.filter(c => selected.has(c.id) && c.email);
    setSending(true);
    setProgress({ done: 0, total: recipients.length });

    const results = await Promise.allSettled(
      recipients.map(async (c) => {
        const resolvedSubj = subject.replace(/\{\{ad\}\}/g, c.fullName).replace(/\{\{salon\}\}/g, salonName);
        const resolvedBody = body.replace(/\{\{ad\}\}/g, c.fullName).replace(/\{\{salon\}\}/g, salonName);
        const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;max-width:560px;margin:auto">${resolvedBody.replace(/\n/g, "<br>")}</div>`;
        const r = await apiFetch("/Email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: c.email, subject: resolvedSubj, html }),
        });
        setProgress(p => ({ ...p, done: p.done + 1 }));
        if (!r.ok) throw new Error("failed");
      })
    );

    const ok   = results.filter(r => r.status === "fulfilled").length;
    const fail = results.filter(r => r.status === "rejected").length;
    setSending(false);
    setProgress({ done: 0, total: 0 });
    toast.success(`${ok} mail gönderildi${fail > 0 ? `, ${fail} hata` : ""}.`);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
      <div style={{ flex: "2 1 300px" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Ad veya e-posta ara..."
            style={{ flex: 1, minWidth: 180, padding: "9px 14px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 13, outline: "none" }} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 13 }}>
            <option value="all">Tüm Durumlar</option>
            {["Yeni","Aktif","VIP","Pasif","Randevu Var"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "8px 14px", background: "#f8fafc", borderRadius: 10, fontSize: 13 }}>
          <input type="checkbox" checked={selected.size > 0 && selected.size === withEmail.length} onChange={toggleAll} style={{ accentColor: "#7c3aed" }} />
          <span style={{ color: "#64748b" }}>{selected.size} seçili · e-postası olan: {withEmail.length}</span>
          {selected.size > 0 && <button onClick={() => setSelected(new Set())} style={{ marginLeft: "auto", background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>Temizle</button>}
        </div>

        {loading ? <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 500, overflowY: "auto" }}>
            {filtered.map(c => {
              const hasEmail = !!c.email;
              const isSel = selected.has(c.id);
              const sc = STATUS_COLORS[c.customerStatus] ?? "#64748b";
              return (
                <div key={c.id} onClick={() => {
                  if (!hasEmail) return;
                  const next = new Set(selected);
                  if (isSel) next.delete(c.id); else next.add(c.id);
                  setSelected(next);
                }} style={{
                  padding: "10px 14px", borderRadius: 10,
                  border: `1px solid ${isSel ? "#7c3aed" : "#e4e7ec"}`,
                  background: isSel ? "#faf5ff" : "#fff",
                  cursor: hasEmail ? "pointer" : "default", opacity: hasEmail ? 1 : 0.5,
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  {hasEmail && <input type="checkbox" checked={isSel} onChange={() => {}} style={{ accentColor: "#7c3aed", flexShrink: 0 }} />}
                  {!hasEmail && <span style={{ width: 16, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{c.fullName}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.email ?? "E-posta yok"}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: `${sc}20`, color: sc, flexShrink: 0 }}>{c.customerStatus}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ flex: "1 1 280px", background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", padding: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Mail Oluştur</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Şablon (isteğe bağlı)</label>
            <select value={tplId} onChange={e => {
              setTplId(e.target.value);
              const t = templates.find(t => t.id === e.target.value);
              if (t) { setCustomSubj(t.subject); setCustomBody(t.body); } else { setCustomSubj(""); setCustomBody(""); }
            }} style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 13 }}>
              <option value="">— Şablon seçin —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Konu</label>
            <input value={customSubj} onChange={e => setCustomSubj(e.target.value)} placeholder="E-posta konusu..."
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 13, boxSizing: "border-box" }} /></div>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>İçerik</label>
            <textarea value={customBody} onChange={e => setCustomBody(e.target.value)} rows={8}
              placeholder={"Merhaba {{ad}},\n..."}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} /></div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>Değişkenler: {"{{ad}}"}, {"{{salon}}"}</div>
          <button onClick={sendBulk} disabled={sending || selected.size === 0}
            style={{ padding: "11px 0", borderRadius: 10, border: "none", background: sending || selected.size === 0 ? "#e9d5ff" : "#7c3aed", color: sending || selected.size === 0 ? "#a78bfa" : "#fff", fontWeight: 700, fontSize: 14, cursor: sending || selected.size === 0 ? "not-allowed" : "pointer" }}>
            {sending ? `Gönderiliyor... (${progress.done}/${progress.total})` : `📧 ${selected.size} Kişiye Gönder`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WHATSAPP TAB
   ═══════════════════════════════════════════════════════════════════════════ */
function WhatsAppTab() {
  const [logs,    setLogs]    = useState<WaLog[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async (p: number) => {
    setLoading(true);
    const r = await apiFetch(`/WhatsApp/logs?page=${p}&pageSize=30`);
    if (r.ok) { const d: Paged<WaLog> = await r.json(); setLogs(d.items); setTotal(d.total); }
    setLoading(false);
  }, []);

  useEffect(() => { loadLogs(page); }, [page, loadLogs]);

  const pages = Math.ceil(total / 30);

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
        WhatsApp API ayarları için <strong>Ayarlar → Entegrasyonlar</strong> sekmesini kullanın.
      </div>
      {loading ? <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div> : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {logs.map(l => (
              <div key={l.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #eaecf0", padding: "12px 16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: WA_STATUS[l.status] ?? "#94a3b8", marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{l.customerName ?? l.toNumber}</div>
                  <div style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.messageBody}</div>
                  {l.errorDetail && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>{l.errorDetail}</div>}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>{new Date(l.createdAtUtc).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            ))}
            {logs.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Mesaj geçmişi bulunamadı.</div>}
          </div>
          {pages > 1 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e4e7ec", background: "#fff", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.5 : 1 }}>‹</button>
              <span style={{ padding: "6px 14px", fontSize: 13, color: "#64748b" }}>{page} / {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e4e7ec", background: "#fff", cursor: page === pages ? "not-allowed" : "pointer", opacity: page === pages ? 0.5 : 1 }}>›</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SMS TAB (placeholder)
   ═══════════════════════════════════════════════════════════════════════════ */
function SmsTab() {
  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ background: "#f8fafc", borderRadius: 16, padding: "48px 24px", textAlign: "center", border: "2px dashed #e2e8f0" }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>📱</div>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>SMS Modülü</div>
        <div style={{ fontSize: 14, color: "#64748b", maxWidth: 360, margin: "0 auto", lineHeight: 1.6 }}>
          SMS entegrasyonu yakında kullanılabilir olacak. Türkiye&apos;nin önde gelen SMS sağlayıcılarıyla (Netgsm, Türktelekom vb.) entegre edilecektir.
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ANKET TAB
   ═══════════════════════════════════════════════════════════════════════════ */
const EMPTY_QUESTION: QuestionForm = { text: "", type: "rating", options: "", isRequired: true };

function AnketTab() {
  const { toast } = useToast();

  const [surveys,   setSurveys]   = useState<SurveyListItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [view,      setView]      = useState<"list" | "edit" | "responses" | "stats">("list");
  const [selected,  setSelected]  = useState<SurveyDetail | null>(null);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [stats,     setStats]     = useState<SurveyStats | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [expandedResponse, setExpandedResponse] = useState<string | null>(null);

  const [form, setForm] = useState({ title: "", description: "", status: "Active" });
  const [questions, setQuestions] = useState<QuestionForm[]>([{ ...EMPTY_QUESTION }]);

  // Mail panel state
  const [mailSurvey,    setMailSurvey]    = useState<SurveyListItem | null>(null);
  const [mailCustomers, setMailCustomers] = useState<Customer[]>([]);
  const [mailSelected,  setMailSelected]  = useState<Set<string>>(new Set());
  const [mailSearch,    setMailSearch]    = useState("");
  const [mailSending,   setMailSending]   = useState(false);
  const [salonName,     setSalonName]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch("/Survey");
    if (r.ok) setSurveys(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openMailPanel = async (s: SurveyListItem) => {
    setMailSurvey(s);
    setMailSelected(new Set());
    setMailSearch("");
    if (mailCustomers.length === 0) {
      apiFetch("/Auth/me").then(r => r.ok ? r.json() : null).then(d => { if (d?.salonName) setSalonName(d.salonName); });
      const r = await apiFetch("/Customers?pageSize=1000");
      if (r.ok) { const d = await r.json(); setMailCustomers(d.items ?? d); }
    }
  };

  const sendSurveyMails = async () => {
    if (!mailSurvey || mailSelected.size === 0) return;
    const link = `${SURVEY_PUBLIC_BASE}/${mailSurvey.id}`;
    const recipients = mailCustomers.filter(c => mailSelected.has(c.id) && c.email);
    if (recipients.length === 0) { toast.error("E-postası olan müşteri seçin."); return; }

    setMailSending(true);
    const results = await Promise.allSettled(recipients.map(async c => {
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;max-width:560px;margin:auto">
        <p>Merhaba <strong>${c.fullName}</strong>,</p>
        <p><strong>${salonName || "Salonumuz"}</strong>'dan aldığınız hizmet hakkında görüşlerinizi öğrenmek isteriz.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#7c3aed;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700">Anketi Doldur</a>
        </p>
        <p style="color:#94a3b8;font-size:12px">Veya bu linki tarayıcınıza yapıştırın: ${link}</p>
      </div>`;
      const r = await apiFetch("/Email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: c.email, subject: `${salonName || "Salonumuz"} — Memnuniyet Anketi`, html }),
      });
      if (!r.ok) throw new Error("failed");
    }));

    setMailSending(false);
    const ok   = results.filter(r => r.status === "fulfilled").length;
    const fail = results.filter(r => r.status === "rejected").length;
    toast.success(`${ok} mail gönderildi${fail > 0 ? `, ${fail} hata` : ""}.`);
    setMailSurvey(null);
  };

  const openCreate = () => {
    setSelected(null);
    setForm({ title: "", description: "", status: "Active" });
    setQuestions([{ ...EMPTY_QUESTION }]);
    setView("edit");
  };

  const openEdit = async (s: SurveyListItem) => {
    const r = await apiFetch(`/Survey/${s.id}`);
    if (!r.ok) { toast.error("Anket yüklenemedi."); return; }
    const detail: SurveyDetail = await r.json();
    setSelected(detail);
    setForm({ title: detail.title, description: detail.description ?? "", status: detail.status });
    setQuestions(detail.questions.map(q => ({ text: q.text, type: q.type, options: q.options ?? "", isRequired: q.isRequired })));
    setView("edit");
  };

  const openResponses = async (s: SurveyListItem) => {
    setSelected(s as SurveyDetail);
    const r = await apiFetch(`/Survey/${s.id}/responses`);
    if (r.ok) setResponses(await r.json());
    setView("responses");
  };

  const openStats = async (s: SurveyListItem) => {
    setSelected(s as SurveyDetail);
    const r = await apiFetch(`/Survey/${s.id}/stats`);
    if (r.ok) setStats(await r.json());
    setView("stats");
  };

  const saveForm = async () => {
    if (!form.title.trim()) { toast.error("Anket başlığı zorunludur."); return; }
    if (questions.some(q => !q.text.trim())) { toast.error("Tüm soruların metni girilmelidir."); return; }
    setSaving(true);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      status: form.status,
      questions: questions.map((q, i) => ({
        sortOrder: i + 1,
        text: q.text.trim(),
        type: q.type,
        options: q.options.trim() || undefined,
        isRequired: q.isRequired,
      })),
    };

    const url    = selected ? `/Survey/${selected.id}` : "/Survey";
    const method = selected ? "PUT" : "POST";
    const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    if (r.ok) {
      toast.success(selected ? "Anket güncellendi." : "Anket oluşturuldu.");
      await load();
      setView("list");
    } else {
      toast.error("Kaydetme başarısız.");
    }
    setSaving(false);
  };

  const toggleStatus = async (s: SurveyListItem) => {
    const r = await apiFetch(`/Survey/${s.id}/status`, { method: "PATCH" });
    if (r.ok) {
      const d = await r.json();
      toast.success(`Anket ${d.status === "Active" ? "aktif edildi" : "kapatıldı"}.`);
      await load();
    }
  };

  const deleteSurvey = async (s: SurveyListItem) => {
    const r = await apiFetch(`/Survey/${s.id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Anket silindi."); await load(); } else toast.error("Silinemedi.");
  };

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/survey/${id}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Bağlantı kopyalandı."));
  };

  const addQuestion    = () => setQuestions(q => [...q, { ...EMPTY_QUESTION }]);
  const removeQuestion = (i: number) => setQuestions(q => q.filter((_, idx) => idx !== i));
  const moveQuestion   = (i: number, dir: -1 | 1) => {
    const next = [...questions];
    const swap = i + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[i], next[swap]] = [next[swap], next[i]];
    setQuestions(next);
  };
  const updateQ = (i: number, patch: Partial<QuestionForm>) =>
    setQuestions(q => q.map((x, idx) => idx === i ? { ...x, ...patch } : x));

  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };

  /* ── List view ─────────────────────────────────────────────────────────── */
  if (view === "list") {
    const mailFiltered = mailCustomers.filter(c =>
      !mailSearch || c.fullName.toLowerCase().includes(mailSearch.toLowerCase()) || (c.email ?? "").toLowerCase().includes(mailSearch.toLowerCase())
    );
    const withEmail = mailFiltered.filter(c => c.email);

    return (
      <div style={{ maxWidth: mailSurvey ? 1200 : 900, display: "flex", gap: 24, alignItems: "flex-start" }}>
        {/* Survey list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#64748b" }}>Müşterilerinizin memnuniyetini ölçün ve geri bildirim toplayın.</div>
            <button onClick={openCreate} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Yeni Anket</button>
          </div>

          {loading ? <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div> : surveys.length === 0 ? (
            <div style={{ background: "#f8fafc", borderRadius: 16, padding: "60px 24px", textAlign: "center", border: "2px dashed #e2e8f0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Henüz anket yok</div>
              <div style={{ fontSize: 14, color: "#64748b", marginBottom: 20 }}>İlk memnuniyet anketinizi oluşturun ve müşterilerinizle paylaşın.</div>
              <button onClick={openCreate} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Anket Oluştur</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {surveys.map(s => (
                <div key={s.id} style={{ background: "#fff", borderRadius: 16, border: `1px solid ${mailSurvey?.id === s.id ? "#7c3aed" : "#eaecf0"}`, padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{s.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 999,
                          background: s.status === "Active" ? "#dcfce7" : "#f1f5f9",
                          color: s.status === "Active" ? "#16a34a" : "#64748b" }}>
                          {s.status === "Active" ? "Aktif" : "Kapalı"}
                        </span>
                        {s.status === "Active" && (
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>· Kasadan otomatik WA gönderilir</span>
                        )}
                      </div>
                      {s.description && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>{s.description}</div>}
                      <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#94a3b8", flexWrap: "wrap" }}>
                        <span>📝 {s.questionCount} soru</span>
                        <span>📊 {s.responseCount} yanıt</span>
                        {s.avgRating != null && <span>⭐ {s.avgRating.toFixed(1)} ort.</span>}
                        <span>{new Date(s.createdAtUtc).toLocaleDateString("tr-TR")}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button onClick={() => copyLink(s.id)} title="Bağlantıyı kopyala"
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e4e7ec", background: "#fff", fontSize: 12, cursor: "pointer" }}>🔗 Link</button>
                      <button onClick={() => openMailPanel(s)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${mailSurvey?.id === s.id ? "#7c3aed" : "#e4e7ec"}`, background: mailSurvey?.id === s.id ? "#faf5ff" : "#fff", color: mailSurvey?.id === s.id ? "#7c3aed" : "#344054", fontSize: 12, fontWeight: mailSurvey?.id === s.id ? 700 : 400, cursor: "pointer" }}>📧 Mail Gönder</button>
                      <button onClick={() => openStats(s)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e4e7ec", background: "#fff", fontSize: 12, cursor: "pointer" }}>📊 İstat.</button>
                      <button onClick={() => openResponses(s)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e4e7ec", background: "#fff", fontSize: 12, cursor: "pointer" }}>📋 Yanıtlar</button>
                      <button onClick={() => openEdit(s)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #7c3aed", background: "#faf5ff", color: "#7c3aed", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Düzenle</button>
                      <button onClick={() => toggleStatus(s)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e4e7ec", background: "#fff", fontSize: 12, cursor: "pointer" }}>
                        {s.status === "Active" ? "Kapat" : "Aktif Et"}
                      </button>
                      <button onClick={() => deleteSurvey(s)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 12, cursor: "pointer" }}>Sil</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mail send panel */}
        {mailSurvey && (
          <div style={{ flex: "1 1 300px", maxWidth: 380, background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>📧 Mail ile Gönder</div>
              <button onClick={() => setMailSurvey(null)} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 18, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
              <strong>{mailSurvey.title}</strong> anketi seçili müşterilere mail ile gönderilecek.
            </div>

            <input value={mailSearch} onChange={e => setMailSearch(e.target.value)} placeholder="🔍 Müşteri ara..."
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #e4e7ec", fontSize: 12, boxSizing: "border-box", marginBottom: 10 }} />

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12, color: "#64748b" }}>
              <input type="checkbox"
                checked={mailSelected.size > 0 && mailSelected.size === withEmail.length}
                onChange={() => {
                  if (mailSelected.size === withEmail.length) setMailSelected(new Set());
                  else setMailSelected(new Set(withEmail.map(c => c.id)));
                }}
                style={{ accentColor: "#7c3aed" }} />
              {mailSelected.size} seçili · {withEmail.length} e-postalı
            </div>

            <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
              {mailFiltered.map(c => {
                const isSel = mailSelected.has(c.id);
                const hasEmail = !!c.email;
                return (
                  <div key={c.id} onClick={() => {
                    if (!hasEmail) return;
                    const next = new Set(mailSelected);
                    if (isSel) next.delete(c.id); else next.add(c.id);
                    setMailSelected(next);
                  }} style={{
                    padding: "8px 10px", borderRadius: 8, cursor: hasEmail ? "pointer" : "default",
                    border: `1px solid ${isSel ? "#7c3aed" : "#e4e7ec"}`,
                    background: isSel ? "#faf5ff" : "#fff", opacity: hasEmail ? 1 : 0.5,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    {hasEmail && <input type="checkbox" checked={isSel} onChange={() => {}} style={{ accentColor: "#7c3aed", flexShrink: 0 }} />}
                    {!hasEmail && <span style={{ width: 14, flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.fullName}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.email ?? "E-posta yok"}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={sendSurveyMails} disabled={mailSending || mailSelected.size === 0}
              style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "none",
                background: mailSending || mailSelected.size === 0 ? "#e9d5ff" : "#7c3aed",
                color: mailSending || mailSelected.size === 0 ? "#a78bfa" : "#fff",
                fontWeight: 700, fontSize: 13, cursor: mailSending || mailSelected.size === 0 ? "not-allowed" : "pointer" }}>
              {mailSending ? "Gönderiliyor..." : `📧 ${mailSelected.size} Kişiye Gönder`}
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ── Edit view ─────────────────────────────────────────────────────────── */
  if (view === "edit") return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: "#7c3aed", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>← Geri</button>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{selected ? "Anketi Düzenle" : "Yeni Anket"}</div>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", padding: 24, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#344054", marginBottom: 14 }}>Anket Bilgileri</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Başlık *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inp} placeholder="Örn: Hizmet Memnuniyet Anketi" /></div>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Açıklama</label>
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={inp} placeholder="Kısa bir açıklama..." /></div>
          {selected && (
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 4 }}>Durum</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={{ ...inp, width: "auto" }}>
                <option value="Active">Aktif</option>
                <option value="Closed">Kapalı</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#344054" }}>Sorular ({questions.length})</div>
          <button onClick={addQuestion} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Soru Ekle</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {questions.map((q, i) => (
            <div key={i} style={{ border: "1px solid #e4e7ec", borderRadius: 12, padding: 16, background: "#f8fafc" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <input value={q.text} onChange={e => updateQ(i, { text: e.target.value })}
                    placeholder={`Soru ${i + 1}...`}
                    style={{ ...inp, background: "#fff" }} />
                </div>
                <select value={q.type} onChange={e => updateQ(i, { type: e.target.value })}
                  style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 12, background: "#fff" }}>
                  {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {q.type === "choice" && (
                <div style={{ marginBottom: 10 }}>
                  <input value={q.options} onChange={e => updateQ(i, { options: e.target.value })}
                    placeholder="Seçenekler (virgülle ayır): Evet,Hayır,Kısmen"
                    style={{ ...inp, fontSize: 12, background: "#fff" }} />
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", cursor: "pointer" }}>
                  <input type="checkbox" checked={q.isRequired} onChange={e => updateQ(i, { isRequired: e.target.checked })} style={{ accentColor: "#7c3aed" }} />
                  Zorunlu
                </label>
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <button onClick={() => moveQuestion(i, -1)} disabled={i === 0} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e4e7ec", background: "#fff", fontSize: 11, cursor: i === 0 ? "not-allowed" : "pointer", opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                  <button onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e4e7ec", background: "#fff", fontSize: 11, cursor: i === questions.length - 1 ? "not-allowed" : "pointer", opacity: i === questions.length - 1 ? 0.4 : 1 }}>↓</button>
                  <button onClick={() => removeQuestion(i)} disabled={questions.length === 1} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 11, cursor: questions.length === 1 ? "not-allowed" : "pointer", opacity: questions.length === 1 ? 0.4 : 1 }}>Sil</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={() => setView("list")} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #e4e7ec", background: "#fff", fontSize: 13, cursor: "pointer" }}>İptal</button>
          <button onClick={saveForm} disabled={saving}
            style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: saving ? "#e9d5ff" : "#7c3aed", color: saving ? "#a78bfa" : "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── Responses view ────────────────────────────────────────────────────── */
  if (view === "responses") return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: "#7c3aed", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>← Geri</button>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{selected?.title} — Yanıtlar ({responses.length})</div>
      </div>

      {responses.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>Henüz yanıt yok.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {responses.map(r => (
            <div key={r.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #eaecf0", overflow: "hidden" }}>
              <div onClick={() => setExpandedResponse(expandedResponse === r.id ? null : r.id)}
                style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{r.customerName ?? "Anonim"}</div>
                  {r.email && <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.email}</div>}
                </div>
                {r.ratingAvg != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {[1,2,3,4,5].map(n => (
                      <span key={n} style={{ fontSize: 16, color: n <= Math.round(r.ratingAvg!) ? "#f59e0b" : "#e4e7ec" }}>★</span>
                    ))}
                    <span style={{ fontSize: 12, color: "#64748b", marginLeft: 4 }}>{r.ratingAvg.toFixed(1)}</span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(r.submittedAtUtc).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{expandedResponse === r.id ? "▲" : "▼"}</div>
              </div>
              {expandedResponse === r.id && (
                <div style={{ borderTop: "1px solid #f1f5f9", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {r.answers.map((a, i) => (
                    <div key={i}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#344054", marginBottom: 4 }}>{a.questionText}</div>
                      {a.questionType === "rating" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {[1,2,3,4,5].map(n => (
                            <span key={n} style={{ fontSize: 20, color: n <= Number(a.value ?? 0) ? "#f59e0b" : "#e4e7ec" }}>★</span>
                          ))}
                          <span style={{ fontSize: 13, color: "#64748b", marginLeft: 4 }}>{a.value}/5</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#0f172a", background: "#f8fafc", padding: "6px 10px", borderRadius: 8 }}>{a.value ?? "—"}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ── Stats view ────────────────────────────────────────────────────────── */
  if (view === "stats") return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: "#7c3aed", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>← Geri</button>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{selected?.title} — İstatistikler</div>
      </div>

      {!stats ? <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Toplam Yanıt", value: stats.totalResponses, color: "#7c3aed" },
              { label: "Ort. Puan", value: stats.avgRating != null ? `${stats.avgRating.toFixed(1)} / 5` : "—", color: "#f59e0b" },
              { label: "Olumlu (4-5)", value: stats.positive, color: "#16a34a" },
              { label: "Nötr (3)", value: stats.neutral, color: "#d97706" },
              { label: "Olumsuz (1-2)", value: stats.negative, color: "#dc2626" },
            ].map(c => (
              <div key={c.label} style={{ background: "#fff", borderRadius: 14, border: "1px solid #eaecf0", padding: "16px 18px", textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{c.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {stats.questionStats.map(q => (
              <div key={q.questionId} style={{ background: "#fff", borderRadius: 14, border: "1px solid #eaecf0", padding: "16px 20px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{q.questionText}</div>
                {q.questionType === "rating" && q.avgValue != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    {[1,2,3,4,5].map(n => (
                      <span key={n} style={{ fontSize: 22, color: n <= Math.round(q.avgValue!) ? "#f59e0b" : "#e4e7ec" }}>★</span>
                    ))}
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#344054" }}>{q.avgValue.toFixed(1)}</span>
                  </div>
                )}
                {Object.keys(q.valueCounts).length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {Object.entries(q.valueCounts).sort((a, b) => b[1] - a[1]).map(([val, cnt]) => {
                      const total = Object.values(q.valueCounts).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
                      return (
                        <div key={val} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 60, fontSize: 12, color: "#344054", fontWeight: 600, flexShrink: 0 }}>{val}</div>
                          <div style={{ flex: 1, height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: "#7c3aed", borderRadius: 4, transition: "width .4s" }} />
                          </div>
                          <div style={{ width: 50, fontSize: 12, color: "#64748b", textAlign: "right", flexShrink: 0 }}>{cnt} ({pct}%)</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */
export default function CrmPage() {
  const [tab, setTab] = useState<"sablonlar" | "toplu" | "whatsapp" | "sms" | "anket">("sablonlar");

  return (
    <AppShell title="CRM" description="Mail şablonları, toplu iletişim, WhatsApp ve anket yönetimi">
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#f1f5f9", borderRadius: 12, padding: 4, width: "fit-content", flexWrap: "wrap" }}>
        {([
          ["sablonlar", "📝 Mail Şablonları"],
          ["toplu",     "📧 Toplu Mail"],
          ["whatsapp",  "💬 WhatsApp"],
          ["sms",       "📱 SMS"],
          ["anket",     "📋 Anket"],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
            fontWeight: 600, fontSize: 13,
            background: tab === t ? "#fff" : "transparent",
            color: tab === t ? "#0f172a" : "#64748b",
            boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,.08)" : "none",
          }}>{label}</button>
        ))}
      </div>

      {tab === "sablonlar" && <MailSablonlariTab />}
      {tab === "toplu"     && <TopluMailTab />}
      {tab === "whatsapp"  && <WhatsAppTab />}
      {tab === "sms"       && <SmsTab />}
      {tab === "anket"     && <AnketTab />}
    </AppShell>
  );
}
