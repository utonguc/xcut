"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { fmtTime, fmtDateLong, fmtDateObjLong } from "@/lib/tz";
import Link from "next/link";

type PublicStylist = {
  id: string;
  fullName: string;
  specialty?: string;
  photoUrl?: string;
};

type PublicSalon = {
  name: string;
  slug: string;
  primaryColor?: string;
  bookingEnabled?: boolean;
  stylists?: PublicStylist[];
};

type TimeSlot = {
  startUtc: string;
  endUtc: string;
  available: boolean;
};

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";

function fmtDate(utc: string) { return fmtDateLong(utc); }
function fmtFullDate(d: Date) { return fmtDateObjLong(d); }

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isDark(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}

const STEP_LABELS = ["Stilist Seçimi", "Tarih & Saat", "Kişisel Bilgiler", "Tamamlandı"];

function BookPageInner() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const preselectedStylistId = searchParams.get("stylistId");

  const [salon, setSalon]       = useState<PublicSalon | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [step, setStep]                     = useState(1);
  const [selectedStylist, setSelectedStylist] = useState<PublicStylist | null>(null);
  const [selectedDate, setSelectedDate]     = useState<string>(() => toLocalDateStr(new Date()));
  const [slots, setSlots]                   = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading]     = useState(false);
  const [selectedSlot, setSelectedSlot]     = useState<TimeSlot | null>(null);
  const [form, setForm]                     = useState({
    customerFirstName: "", customerLastName: "",
    customerPhone: "", customerEmail: "",
    serviceName: "", customerNotes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr]   = useState("");
  const [bookingId, setBookingId]   = useState("");

  useEffect(() => {
    fetch(`${API}/SalonWebsite/public/${slug}`)
      .then(r => { if (!r.ok) { setNotFound(true); return null; } return r.json(); })
      .then(d => {
        if (d) {
          setSalon(d);
          if (preselectedStylistId && d.stylists) {
            const st = d.stylists.find((x: PublicStylist) => x.id === preselectedStylistId);
            if (st) { setSelectedStylist(st); setStep(2); }
          }
        }
      })
      .finally(() => setLoading(false));
  }, [slug, preselectedStylistId]);

  useEffect(() => {
    if (!selectedStylist || !selectedDate || step !== 2) return;
    setSlotsLoading(true);
    setSelectedSlot(null);
    setSlots([]);
    fetch(`${API}/SalonWebsite/public/${slug}/stylists/${selectedStylist.id}/slots?date=${selectedDate}&tzOffsetMinutes=180`)
      .then(r => r.ok ? r.json() : [])
      .then((d: TimeSlot[]) => setSlots(d))
      .finally(() => setSlotsLoading(false));
  }, [selectedStylist, selectedDate, slug, step]);

  const submit = async () => {
    if (!selectedSlot || !selectedStylist) return;
    setSubmitting(true);
    setSubmitErr("");
    try {
      const res = await fetch(`${API}/AppointmentRequests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stylistId: selectedStylist.id,
          requestedStartUtc: selectedSlot.startUtc,
          requestedEndUtc: selectedSlot.endUtc,
          serviceName: form.serviceName || "Genel Randevu",
          customerFirstName: form.customerFirstName,
          customerLastName: form.customerLastName,
          customerPhone: form.customerPhone,
          customerEmail: form.customerEmail,
          customerNotes: form.customerNotes,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Bir hata oluştu.");
      setBookingId(d.id ?? "");
      setStep(4);
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (notFound || !salon || !salon.bookingEnabled) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Online randevu kapalı</div>
        <Link href={`/site/${slug}`} style={{ color: "#7c3aed", fontSize: 14 }}>← Salona dön</Link>
      </div>
    </div>
  );

  const primary = salon.primaryColor ?? "#7c3aed";
  const onPrimary = isDark(primary) ? "#fff" : "#111827";
  const stylists = salon.stylists ?? [];
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: "1px solid #e5e7eb", fontSize: 14, boxSizing: "border-box",
    outline: "none", background: "white", color: "#111827",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#111827" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,textarea:focus{border-color:${primary} !important; box-shadow:0 0 0 3px ${primary}18 !important;}`}</style>

      <header style={{ background: "white", borderBottom: "1px solid #f3f4f6", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href={`/site/${slug}`} style={{ fontWeight: 800, fontSize: 17, color: primary, textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {salon.name}
          </Link>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#6b7280" }}>Online Randevu</span>
        </div>
      </header>

      <div style={{ background: "white", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 24px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {STEP_LABELS.map((label, i) => {
              const num = i + 1;
              const done = step > num;
              const active = step === num;
              return (
                <div key={label} style={{ display: "flex", alignItems: "center", flex: i < STEP_LABELS.length - 1 ? "1 1 auto" : undefined }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%",
                      background: done ? "#16a34a" : active ? primary : "#f3f4f6",
                      color: done || active ? (done ? "#fff" : onPrimary) : "#9ca3af",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, transition: "all 0.2s",
                    }}>
                      {done ? (
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : num}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, color: active ? primary : "#9ca3af", marginTop: 5, whiteSpace: "nowrap" }}>
                      {label}
                    </span>
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: done ? "#16a34a" : "#f3f4f6", margin: "0 8px", marginBottom: 20, transition: "background 0.2s" }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "40px 24px 80px" }}>

        {step === 1 && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.4px", marginBottom: 6 }}>Stilist Seçin</h1>
            <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 28 }}>Randevu almak istediğiniz stilisti seçin</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {stylists.map(s => {
                const photoSrc = s.photoUrl ? `${API.replace("/api","")}${s.photoUrl}` : null;
                return (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedStylist(s); setStep(2); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 16, padding: "16px 20px",
                      background: "white", borderRadius: 12, cursor: "pointer",
                      border: "1.5px solid #e5e7eb",
                      textAlign: "left", transition: "border-color 0.15s, box-shadow 0.15s",
                      width: "100%",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = primary;
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 0 3px ${primary}14`;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb";
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                    }}
                  >
                    <div style={{
                      width: 50, height: 50, borderRadius: 10, flexShrink: 0,
                      background: `${primary}10`, overflow: "hidden",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {photoSrc
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={photoSrc} alt={s.fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : (
                          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{s.fullName}</div>
                      {s.specialty && <div style={{ fontSize: 13, color: primary, fontWeight: 500, marginTop: 2 }}>{s.specialty}</div>}
                    </div>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                );
              })}
              {stylists.length === 0 && (
                <div style={{ textAlign: "center", padding: 48, background: "white", borderRadius: 12, border: "1px solid #f3f4f6", color: "#9ca3af" }}>
                  Aktif stilist bulunamadı.
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && selectedStylist && (
          <div>
            <button onClick={() => { setStep(1); setSelectedSlot(null); }} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 13,
              fontWeight: 600, color: "#6b7280", padding: 0, marginBottom: 20,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Stilist değiştir
            </button>

            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.4px", marginBottom: 6 }}>Tarih ve Saat</h1>
            <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>Müsait bir tarih ve saat seçin</p>

            <div style={{
              display: "flex", gap: 12, alignItems: "center",
              padding: "12px 16px", borderRadius: 10, marginBottom: 24,
              background: `${primary}08`, border: `1px solid ${primary}20`,
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${primary}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedStylist.fullName}</div>
                {selectedStylist.specialty && <div style={{ fontSize: 12, color: primary }}>{selectedStylist.specialty}</div>}
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Tarih</label>
              <input
                type="date"
                value={selectedDate}
                min={toLocalDateStr(new Date())}
                onChange={e => setSelectedDate(e.target.value)}
                style={{ ...inputStyle, fontSize: 15 }}
              />
              {selectedDate && (
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6, fontWeight: 500 }}>
                  {fmtFullDate(new Date(selectedDate + "T12:00:00"))}
                </p>
              )}
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Müsait Saatler</label>
              {slotsLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: "#9ca3af", fontSize: 13 }}>Saatler yükleniyor...</div>
              ) : slots.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, background: "white", borderRadius: 12, border: "1px solid #f3f4f6", color: "#9ca3af", fontSize: 14 }}>
                  Bu tarih için müsait saat bulunamadı.<br />
                  <span style={{ fontSize: 12 }}>Lütfen farklı bir tarih seçin.</span>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {slots.map(s => {
                    const isSelected = selectedSlot?.startUtc === s.startUtc;
                    return (
                      <button
                        key={s.startUtc}
                        disabled={!s.available}
                        onClick={() => setSelectedSlot(s)}
                        style={{
                          padding: "11px 0", borderRadius: 8, fontSize: 13, fontWeight: 600,
                          border: isSelected ? `1.5px solid ${primary}` : "1.5px solid #e5e7eb",
                          background: !s.available ? "#fafafa" : isSelected ? `${primary}10` : "white",
                          color: !s.available ? "#d1d5db" : isSelected ? primary : "#374151",
                          cursor: s.available ? "pointer" : "not-allowed",
                          textDecoration: !s.available ? "line-through" : "none",
                          transition: "all 0.12s",
                        }}
                        onMouseEnter={e => { if (s.available && !isSelected) (e.currentTarget as HTMLButtonElement).style.borderColor = primary; }}
                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb"; }}
                      >
                        {fmtTime(s.startUtc)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedSlot && (
              <button onClick={() => setStep(3)} style={{
                width: "100%", marginTop: 28, padding: "14px 0", borderRadius: 10,
                background: primary, border: "none", color: onPrimary,
                fontWeight: 700, fontSize: 15, cursor: "pointer", letterSpacing: "-0.2px",
              }}>
                Devam Et
              </button>
            )}
          </div>
        )}

        {step === 3 && selectedStylist && selectedSlot && (
          <div>
            <button onClick={() => setStep(2)} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 13,
              fontWeight: 600, color: "#6b7280", padding: 0, marginBottom: 20,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Geri
            </button>

            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.4px", marginBottom: 6 }}>Bilgilerinizi Girin</h1>
            <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>Randevu onayı için iletişim bilgileriniz gereklidir</p>

            <div style={{ background: "white", borderRadius: 12, padding: "16px 20px", marginBottom: 28, border: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Randevu Özeti</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 8, fontSize: 14 }}>
                  <span style={{ color: "#9ca3af", minWidth: 80 }}>Stilist</span>
                  <span style={{ fontWeight: 600 }}>{selectedStylist.fullName}</span>
                </div>
                <div style={{ display: "flex", gap: 8, fontSize: 14 }}>
                  <span style={{ color: "#9ca3af", minWidth: 80 }}>Tarih</span>
                  <span style={{ fontWeight: 600 }}>{fmtDate(selectedSlot.startUtc)}</span>
                </div>
                <div style={{ display: "flex", gap: 8, fontSize: 14 }}>
                  <span style={{ color: "#9ca3af", minWidth: 80 }}>Saat</span>
                  <span style={{ fontWeight: 600 }}>{fmtTime(selectedSlot.startUtc)} – {fmtTime(selectedSlot.endUtc)}</span>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { key: "customerFirstName", label: "Ad *",   placeholder: "Adınız" },
                { key: "customerLastName",  label: "Soyad *", placeholder: "Soyadınız" },
                { key: "customerPhone",     label: "Telefon", placeholder: "+90 500 000 0000" },
                { key: "customerEmail",     label: "E-posta", placeholder: "ornek@email.com" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</label>
                  <input
                    value={form[key as keyof typeof form]}
                    onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={inputStyle}
                  />
                </div>
              ))}

              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" }}>İstenen Hizmet</label>
                <input
                  value={form.serviceName}
                  onChange={e => setForm(prev => ({ ...prev, serviceName: e.target.value }))}
                  placeholder="Saç kesimi, boyama, tırnak bakımı, cilt bakımı..."
                  style={inputStyle}
                />
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" }}>Ek Notlar</label>
                <textarea
                  value={form.customerNotes}
                  onChange={e => setForm(prev => ({ ...prev, customerNotes: e.target.value }))}
                  placeholder="Salon ekibine iletmek istediğiniz bilgiler..."
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>
            </div>

            {submitErr && (
              <div style={{ marginTop: 16, padding: "12px 16px", background: "#fef2f2", borderRadius: 8, color: "#dc2626", fontSize: 13, fontWeight: 500 }}>
                {submitErr}
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting || !form.customerFirstName || !form.customerLastName}
              style={{
                width: "100%", marginTop: 24, padding: "14px 0", borderRadius: 10,
                background: primary, border: "none", color: onPrimary,
                fontWeight: 700, fontSize: 15, cursor: "pointer",
                opacity: (submitting || !form.customerFirstName || !form.customerLastName) ? 0.6 : 1,
                transition: "opacity 0.15s", letterSpacing: "-0.2px",
              }}
            >
              {submitting ? "Gönderiliyor..." : "Randevu Talebini Gönder"}
            </button>
            <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 12 }}>
              Talebiniz salon tarafından onaylandıktan sonra bildirim alacaksınız.
            </p>
          </div>
        )}

        {step === 4 && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%", background: "#f0fdf4",
              border: "2px solid #bbf7d0", margin: "0 auto 28px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.4px", marginBottom: 12 }}>
              Talebiniz Alındı
            </h1>
            <p style={{ color: "#6b7280", fontSize: 15, maxWidth: 400, margin: "0 auto 28px", lineHeight: 1.65 }}>
              Salon ekibimiz talebinizi en kısa sürede inceleyecek ve sizinle iletişime geçecektir.
              {form.customerEmail && (
                <> <strong style={{ color: "#374151" }}>{form.customerEmail}</strong> adresine bilgi e-postası gönderildi.</>
              )}
            </p>

            {bookingId && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                padding: "10px 20px", borderRadius: 8,
                background: "white", border: "1px solid #f3f4f6", marginBottom: 36,
              }}>
                <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500 }}>Talep Numarası</span>
                <code style={{ fontSize: 13, fontWeight: 700, color: "#111827", fontFamily: "monospace" }}>
                  {bookingId.slice(0, 8).toUpperCase()}
                </code>
              </div>
            )}

            <div>
              <Link href={`/site/${slug}`} style={{
                display: "inline-block", padding: "12px 28px", borderRadius: 10,
                background: primary, color: onPrimary, fontWeight: 700, fontSize: 14,
                textDecoration: "none",
              }}>
                Ana Sayfaya Dön
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <BookPageInner />
    </Suspense>
  );
}
