"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type WebsiteData = {
  id?: string;
  slug: string;
  customDomain?: string;
  isPublished?: boolean;
  heroTitle?: string;
  heroSubtitle?: string;
  heroImageUrl?: string;
  aboutText?: string;
  address?: string;
  phone?: string;
  email?: string;
  googleMapsUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  whatsAppNumber?: string;
  primaryColor?: string;
  theme?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  showPrices?: boolean;
  showReviews?: boolean;
  bookingEnabled?: boolean;
  listedInDirectory?: boolean;
};

const THEMES = [
  { value: "modern",  label: "Modern",  preview: "#1d4ed8" },
  { value: "minimal", label: "Minimal", preview: "#374151" },
  { value: "elegant", label: "Elegans", preview: "#7c3aed" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--surface, #fff)", borderRadius: 16,
      border: "1px solid var(--border, #eaecf0)", padding: "24px 28px", marginBottom: 20,
    }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20, color: "var(--text, #0f172a)" }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", marginBottom: 4 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid #d0d5dd", fontSize: 13, boxSizing: "border-box",
  background: "var(--surface, #fff)", color: "var(--text, #101828)",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: "vertical",
};

export default function WebsitePage() {
  const [data, setData]     = useState<WebsiteData>({ slug: "", primaryColor: "#7c3aed", theme: "elegant", showReviews: true, bookingEnabled: true, showPrices: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState<"content" | "contact" | "design" | "seo" | "domain">("content");
  const [toast, setToast]     = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [aiOpen,     setAiOpen]     = useState(false);
  const [aiForm,     setAiForm]     = useState({ salonName: "", city: "", specialty: "", tone: "professional", extraContext: "" });
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiPreview,  setAiPreview]  = useState<Record<string, string> | null>(null);
  const [aiError,    setAiError]    = useState("");

  useEffect(() => {
    apiFetch("/SalonWebsite").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setData(d);
    }).finally(() => setLoading(false));
  }, []);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/SalonWebsite", {
        method: "PUT",
        body: JSON.stringify(data),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Kayıt hatası.");
      showToast("success", "Web sitesi kaydedildi.");
      setData(prev => ({ ...prev, id: d.id ?? prev.id }));
    } catch (e: unknown) {
      showToast("error", e instanceof Error ? e.message : "Hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    const res = await apiFetch("/SalonWebsite/publish", { method: "PATCH" });
    if (res.ok) {
      const d = await res.json();
      setData(prev => ({ ...prev, isPublished: d.isPublished }));
      showToast("success", d.isPublished ? "Web sitesi yayınlandı!" : "Yayından kaldırıldı.");
    }
  };

  const upd = (k: keyof WebsiteData, v: unknown) => setData(prev => ({ ...prev, [k]: v }));

  const generateAiContent = async () => {
    if (!aiForm.salonName.trim()) { setAiError("Salon adını girin."); return; }
    setAiLoading(true); setAiError(""); setAiPreview(null);
    try {
      const res = await fetch("/api/ai-website-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicName: aiForm.salonName, ...aiForm }),
      });

      let d: Record<string, string> = {};
      try { d = await res.json(); } catch {
        throw new Error("Sunucudan geçersiz yanıt alındı. Lütfen tekrar deneyin.");
      }

      if (!res.ok) throw new Error(d.error ?? "İçerik oluşturulamadı.");
      setAiPreview(d);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : "Hata oluştu.");
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiContent = () => {
    if (!aiPreview) return;
    if (aiPreview.heroTitle)       upd("heroTitle",       aiPreview.heroTitle);
    if (aiPreview.heroSubtitle)    upd("heroSubtitle",    aiPreview.heroSubtitle);
    if (aiPreview.aboutText)       upd("aboutText",       aiPreview.aboutText);
    if (aiPreview.metaTitle)       upd("metaTitle",       aiPreview.metaTitle);
    if (aiPreview.metaDescription) upd("metaDescription", aiPreview.metaDescription);
    if (aiPreview.metaKeywords)    upd("metaKeywords",    aiPreview.metaKeywords);
    setAiOpen(false); setAiPreview(null);
    showToast("success", "AI içeriği uygulandı! Kaydetmeyi unutmayın.");
  };

  const TABS = [
    { key: "content", label: "📝 İçerik" },
    { key: "contact", label: "📞 İletişim" },
    { key: "design",  label: "🎨 Tasarım" },
    { key: "seo",     label: "🔍 SEO" },
    { key: "domain",  label: "🌐 Domain" },
  ] as const;

  if (loading) {
    return (
      <AppShell title="Web Sitesi" description="Salon web sitenizi yönetin">
        <div style={{ textAlign: "center", padding: 80, color: "#94a3b8" }}>Yükleniyor...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Web Sitesi" description="Salon web sitenizi oluşturun ve yönetin">
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 999,
          padding: "12px 20px", borderRadius: 12,
          background: toast.type === "success" ? "#f0fdf4" : "#fef2f2",
          color: toast.type === "success" ? "#16a34a" : "#dc2626",
          border: `1px solid ${toast.type === "success" ? "#bbf7d0" : "#fecaca"}`,
          fontWeight: 600, fontSize: 13,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
        }}>
          {toast.type === "success" ? "✓" : "✕"} {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            padding: "4px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700,
            background: data.isPublished ? "#f0fdf4" : "#f8fafc",
            color: data.isPublished ? "#16a34a" : "#94a3b8",
            border: `1px solid ${data.isPublished ? "#bbf7d0" : "#e4e7ec"}`,
          }}>
            {data.isPublished ? "🟢 Yayında" : "⚪ Taslak"}
          </div>
          {data.isPublished && data.slug && (
            <a href={`/site/${data.slug}`} target="_blank" rel="noreferrer" style={{
              fontSize: 12, color: "#7c3aed", textDecoration: "none", fontWeight: 600,
            }}>
              🔗 Siteyi Gör ↗
            </a>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {data.id && (
            <button onClick={togglePublish} style={{
              padding: "9px 18px", borderRadius: 10,
              border: `1px solid ${data.isPublished ? "#fecaca" : "#bbf7d0"}`,
              background: data.isPublished ? "#fef2f2" : "#f0fdf4",
              color: data.isPublished ? "#dc2626" : "#16a34a",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              {data.isPublished ? "Yayından Kaldır" : "Yayınla"}
            </button>
          )}
          <button onClick={save} disabled={saving} style={{
            padding: "9px 20px", borderRadius: 10, border: "none",
            background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13,
            cursor: "pointer", opacity: saving ? 0.7 : 1,
          }}>
            {saving ? "Kaydediliyor..." : "💾 Kaydet"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid var(--border, #eaecf0)", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "10px 18px", border: "none", background: "transparent",
            fontWeight: tab === t.key ? 700 : 500, fontSize: 13,
            color: tab === t.key ? "#7c3aed" : "#64748b",
            borderBottom: tab === t.key ? "2px solid #7c3aed" : "2px solid transparent",
            cursor: "pointer", marginBottom: -2,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "content" && (
        <>
          <div style={{
            background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
            borderRadius: 16, padding: "20px 24px", marginBottom: 20,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 32 }}>✨</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>AI ile İçerik Oluştur</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
                  Salon adı ve uzmanlık alanını gir — hero metni, hakkımızda ve SEO otomatik dolsun.
                </div>
              </div>
            </div>
            <button onClick={() => setAiOpen(v => !v)} style={{
              padding: "10px 22px", borderRadius: 10, border: "1.5px solid rgba(255,255,255,0.4)",
              background: aiOpen ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.1)",
              color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0,
            }}>
              {aiOpen ? "✕ Kapat" : "✨ Başlat"}
            </button>
          </div>

          {aiOpen && (
            <div style={{
              background: "var(--surface, #fff)", border: "2px solid #7c3aed30",
              borderRadius: 16, padding: "24px 28px", marginBottom: 20,
              boxShadow: "0 4px 20px rgba(124,58,237,0.08)",
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#4f46e5", marginBottom: 18 }}>AI Asistan — Web Sitesi İçerik Oluşturucu</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 4 }}>Salon Adı *</label>
                  <input
                    value={aiForm.salonName}
                    onChange={e => setAiForm(p => ({ ...p, salonName: e.target.value }))}
                    placeholder="Örn: Şık Saç Tasarım Salonu"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 4 }}>Şehir</label>
                  <input
                    value={aiForm.city}
                    onChange={e => setAiForm(p => ({ ...p, city: e.target.value }))}
                    placeholder="İstanbul"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 4 }}>Uzmanlık Alanı</label>
                  <input
                    value={aiForm.specialty}
                    onChange={e => setAiForm(p => ({ ...p, specialty: e.target.value }))}
                    placeholder="Saç, tırnak, cilt, masaj..."
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 4 }}>Ton</label>
                  <select
                    value={aiForm.tone}
                    onChange={e => setAiForm(p => ({ ...p, tone: e.target.value }))}
                    style={{ ...inputStyle, cursor: "pointer" }}
                  >
                    <option value="professional">Resmi & Profesyonel</option>
                    <option value="warm">Sıcak & Samimi</option>
                    <option value="modern">Modern & Dinamik</option>
                    <option value="luxury">Prestijli & Lüks</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", display: "block", marginBottom: 4 }}>Ek Bilgi (opsiyonel)</label>
                <input
                  value={aiForm.extraContext}
                  onChange={e => setAiForm(p => ({ ...p, extraContext: e.target.value }))}
                  placeholder="Örn: 10 yıllık deneyim, 5 uzman stilist, organik ürünler"
                  style={inputStyle}
                />
              </div>

              {aiError && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#dc2626", marginBottom: 14 }}>
                  ⚠ {aiError}
                </div>
              )}

              <button onClick={generateAiContent} disabled={aiLoading} style={{
                padding: "10px 24px", borderRadius: 10, border: "none",
                background: aiLoading ? "#a78bfa" : "linear-gradient(135deg, #4f46e5, #7c3aed)",
                color: "#fff", fontWeight: 700, fontSize: 13, cursor: aiLoading ? "not-allowed" : "pointer",
              }}>
                {aiLoading ? "✨ Oluşturuluyor..." : "✨ İçerik Oluştur"}
              </button>

              {aiPreview && (
                <div style={{ marginTop: 20, border: "1px solid #e9d5ff", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ background: "#faf5ff", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#6d28d9" }}>AI Tarafından Oluşturulan İçerik</div>
                    <button onClick={applyAiContent} style={{
                      padding: "8px 18px", borderRadius: 8, border: "none",
                      background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer",
                    }}>
                      ✓ Tümünü Uygula
                    </button>
                  </div>
                  <div style={{ padding: "16px", display: "grid", gap: 12 }}>
                    {[
                      { key: "heroTitle",       label: "Hero Başlık" },
                      { key: "heroSubtitle",    label: "Hero Alt Başlık" },
                      { key: "aboutText",       label: "Hakkımızda" },
                      { key: "metaTitle",       label: "SEO Başlık" },
                      { key: "metaDescription", label: "SEO Açıklama" },
                      { key: "metaKeywords",    label: "Anahtar Kelimeler" },
                    ].map(({ key, label }) => aiPreview[key] ? (
                      <div key={key}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 13, color: "#1e1b4b", background: "#f5f3ff", borderRadius: 8, padding: "8px 12px", lineHeight: 1.5 }}>
                          {aiPreview[key]}
                        </div>
                      </div>
                    ) : null)}
                  </div>
                </div>
              )}
            </div>
          )}

          <Section title="Temel Ayarlar">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Site URL Adı (Slug) *" hint="Sadece küçük harf, rakam ve tire kullanın">
                <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                  <span style={{
                    padding: "9px 10px", background: "var(--surface-2, #f8fafc)", border: "1px solid #d0d5dd",
                    borderRight: "none", borderRadius: "8px 0 0 8px", fontSize: 12, color: "#64748b",
                    whiteSpace: "nowrap",
                  }}>site/</span>
                  <input
                    value={data.slug}
                    onChange={e => upd("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="salon-adiniz"
                    style={{ ...inputStyle, borderRadius: "0 8px 8px 0" }}
                  />
                </div>
              </Field>
              <Field label="Online Randevu">
                <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                  {[{ v: true, l: "Aktif" }, { v: false, l: "Kapalı" }].map(({ v, l }) => (
                    <label key={l} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                      <input type="radio" checked={data.bookingEnabled === v} onChange={() => upd("bookingEnabled", v)} />
                      {l}
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          </Section>

          <Section title="Hero Bölümü">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Başlık">
                <input value={data.heroTitle ?? ""} onChange={e => upd("heroTitle", e.target.value)} placeholder="Güzelliğinizi Keşfedin" style={inputStyle} />
              </Field>
              <Field label="Alt Başlık">
                <input value={data.heroSubtitle ?? ""} onChange={e => upd("heroSubtitle", e.target.value)} placeholder="Uzman stilistlerimizle..." style={inputStyle} />
              </Field>
            </div>
            <Field label="Hero Görsel URL">
              <input value={data.heroImageUrl ?? ""} onChange={e => upd("heroImageUrl", e.target.value)} placeholder="https://..." style={inputStyle} />
            </Field>
          </Section>

          <Section title="Hakkımızda">
            <Field label="Salon Tanıtım Metni">
              <textarea value={data.aboutText ?? ""} onChange={e => upd("aboutText", e.target.value)} rows={5} placeholder="Salonumuz hakkında..." style={textareaStyle} />
            </Field>
          </Section>

          <Section title="Görünürlük">
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              {[
                { key: "showReviews" as const, label: "Müşteri yorumlarını göster" },
                { key: "showPrices"  as const, label: "Fiyatları göster" },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                  <input type="checkbox" checked={!!data[key]} onChange={e => upd(key, e.target.checked)} style={{ width: 16, height: 16 }} />
                  {label}
                </label>
              ))}
            </div>

            <div style={{ marginTop: 20, padding: "16px 18px", borderRadius: 12, background: "var(--surface-2, #f8fafc)", border: "1px solid var(--border, #eaecf0)" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!data.listedInDirectory}
                  onChange={e => upd("listedInDirectory", e.target.checked)}
                  style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text, #0f172a)" }}>
                    Salon Rehberi&apos;nde listelen
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-2, #64748b)", marginTop: 3, lineHeight: 1.5 }}>
                    xCut&apos;ın müşteri-yönlü salon arama dizininde salonunuz görünür olur. Web sitenizin yayında olması gerekir.
                  </div>
                </div>
              </label>
            </div>
          </Section>
        </>
      )}

      {tab === "contact" && (
        <Section title="İletişim Bilgileri">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Adres">
              <input value={data.address ?? ""} onChange={e => upd("address", e.target.value)} placeholder="Örnek Mah. Örnek Sk. No:1" style={inputStyle} />
            </Field>
            <Field label="Telefon">
              <input value={data.phone ?? ""} onChange={e => upd("phone", e.target.value)} placeholder="+90 212 000 0000" style={inputStyle} />
            </Field>
            <Field label="E-posta">
              <input value={data.email ?? ""} onChange={e => upd("email", e.target.value)} placeholder="info@salon.com" style={inputStyle} />
            </Field>
            <Field label="WhatsApp Numarası">
              <input value={data.whatsAppNumber ?? ""} onChange={e => upd("whatsAppNumber", e.target.value)} placeholder="905321234567" style={inputStyle} />
            </Field>
            <Field label="Google Maps URL">
              <input value={data.googleMapsUrl ?? ""} onChange={e => upd("googleMapsUrl", e.target.value)} placeholder="https://maps.google.com/..." style={inputStyle} />
            </Field>
            <Field label="Instagram URL">
              <input value={data.instagramUrl ?? ""} onChange={e => upd("instagramUrl", e.target.value)} placeholder="https://instagram.com/..." style={inputStyle} />
            </Field>
            <Field label="Facebook URL">
              <input value={data.facebookUrl ?? ""} onChange={e => upd("facebookUrl", e.target.value)} placeholder="https://facebook.com/..." style={inputStyle} />
            </Field>
          </div>
        </Section>
      )}

      {tab === "design" && (
        <>
          <Section title="Tema Seçimi">
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {THEMES.map(t => (
                <div
                  key={t.value}
                  onClick={() => upd("theme", t.value)}
                  style={{
                    width: 160, borderRadius: 14, overflow: "hidden",
                    border: data.theme === t.value ? "3px solid #7c3aed" : "3px solid #e4e7ec",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <div style={{ height: 80, background: t.preview }} />
                  <div style={{ padding: "10px 14px", fontWeight: data.theme === t.value ? 700 : 500, fontSize: 13 }}>
                    {t.label}
                    {data.theme === t.value && <span style={{ marginLeft: 6, color: "#7c3aed" }}>✓</span>}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Renk Ayarları">
            <Field label="Ana Renk">
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <input
                  type="color"
                  value={data.primaryColor ?? "#7c3aed"}
                  onChange={e => upd("primaryColor", e.target.value)}
                  style={{ width: 48, height: 40, padding: 2, borderRadius: 8, border: "1px solid #d0d5dd", cursor: "pointer" }}
                />
                <input
                  type="text"
                  value={data.primaryColor ?? "#7c3aed"}
                  onChange={e => upd("primaryColor", e.target.value)}
                  style={{ ...inputStyle, width: 120 }}
                />
                <div style={{
                  flex: 1, height: 40, borderRadius: 10,
                  background: data.primaryColor ?? "#7c3aed",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 13, fontWeight: 600,
                }}>
                  Önizleme
                </div>
              </div>
            </Field>
          </Section>
        </>
      )}

      {tab === "seo" && (
        <Section title="Arama Motoru Optimizasyonu">
          <Field label="Meta Başlık" hint="Tarayıcı sekmesinde ve Google'da görünür (max 60 karakter)">
            <input value={data.metaTitle ?? ""} onChange={e => upd("metaTitle", e.target.value)} maxLength={60} placeholder="Salon Adı | Hizmet" style={inputStyle} />
            <div style={{ fontSize: 11, color: (data.metaTitle?.length ?? 0) > 60 ? "#dc2626" : "#94a3b8", marginTop: 3 }}>
              {data.metaTitle?.length ?? 0}/60
            </div>
          </Field>
          <Field label="Meta Açıklama" hint="Google arama sonuçlarında görünür (max 160 karakter)">
            <textarea value={data.metaDescription ?? ""} onChange={e => upd("metaDescription", e.target.value)} maxLength={160} rows={3} placeholder="Salonumuz hakkında kısa açıklama..." style={textareaStyle} />
            <div style={{ fontSize: 11, color: (data.metaDescription?.length ?? 0) > 160 ? "#dc2626" : "#94a3b8", marginTop: 3 }}>
              {data.metaDescription?.length ?? 0}/160
            </div>
          </Field>
          <Field label="Anahtar Kelimeler" hint="Virgülle ayırın: kuaför, saç boyama, tırnak">
            <input value={data.metaKeywords ?? ""} onChange={e => upd("metaKeywords", e.target.value)} placeholder="kuaför, saç boyama, tırnak bakımı" style={inputStyle} />
          </Field>

          {(data.metaTitle || data.slug) && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #344054)", marginBottom: 8 }}>Google Önizleme</div>
              <div style={{
                border: "1px solid #e4e7ec", borderRadius: 12, padding: 16,
                background: "var(--surface, #fff)", maxWidth: 540,
              }}>
                <div style={{ fontSize: 12, color: "#0d652d", marginBottom: 2 }}>
                  {typeof window !== "undefined" ? window.location.hostname : "salon.com"}/site/{data.slug}
                </div>
                <div style={{ color: "#1a0dab", fontSize: 16, fontWeight: 500, marginBottom: 4 }}>
                  {data.metaTitle || data.slug}
                </div>
                <div style={{ color: "#4d5156", fontSize: 13 }}>
                  {data.metaDescription || data.aboutText?.slice(0, 120) || "Web sitesi açıklaması..."}
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {tab === "domain" && (
        <>
          <Section title="Varsayılan Site Adresi">
            <div style={{ padding: "14px 16px", background: "var(--surface-2, #f8fafc)", borderRadius: 10, fontSize: 13, marginBottom: 8 }}>
              <span style={{ color: "#64748b" }}>Site adresiniz: </span>
              <strong style={{ color: "#7c3aed" }}>/site/{data.slug || "(slug girilmedi)"}</strong>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              Slug alanını "İçerik" sekmesinden düzenleyebilirsiniz.
            </div>
          </Section>

          <Section title="Özel Domain (CNAME)">
            <Field label="Özel Domain" hint="CNAME kaydınızı bu sunucuya yönlendirin. Örnek: www.salonadi.com">
              <input
                value={data.customDomain ?? ""}
                onChange={e => upd("customDomain", e.target.value.toLowerCase())}
                placeholder="www.salonadi.com"
                style={inputStyle}
              />
            </Field>
            <div style={{
              background: "#fffbeb", borderRadius: 10, padding: "12px 16px",
              border: "1px solid #fcd34d", fontSize: 12, color: "#92400e",
            }}>
              <strong>DNS Ayarı:</strong> Domain sağlayıcınızda CNAME kaydı oluşturun:<br />
              <code style={{ fontFamily: "monospace", background: "#fef9c3", padding: "2px 6px", borderRadius: 4 }}>
                www → app.xcut.com.tr
              </code>
            </div>
          </Section>
        </>
      )}
    </AppShell>
  );
}
