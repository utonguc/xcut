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
  supportedServiceIds?: string[];
};

type PublicService = {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  price: number;
};

type PublicSalon = {
  name: string;
  slug: string;
  primaryColor?: string;
  bookingEnabled?: boolean;
  phone?: string;
  email?: string;
  stylists?: PublicStylist[];
  services?: PublicService[];
};

type TimeSlot = {
  startUtc: string;
  endUtc: string;
  available: boolean;
};

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";
const TZ_OFFSET = new Date().getTimezoneOffset() * -1; // local tz offset in minutes

function fmtDate(utc: string) { return fmtDateLong(utc); }
function fmtFullDate(d: Date) { return fmtDateObjLong(d); }

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function isDark(hex: string) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return (0.299*r + 0.587*g + 0.114*b) < 140;
}

function fmtDuration(mins: number) {
  if (mins < 60) return `${mins} dk`;
  const h = Math.floor(mins/60), m = mins%60;
  return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate()+n); return r;
}

const TR_DAYS = ["Paz","Pzt","Sal","Çar","Per","Cum","Cmt"];
const TR_MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const STEP_LABELS = ["Stilist","Hizmet","Tarih & Saat","Bilgiler","Tamamlandı"];

function BookPageInner() {
  const { slug }     = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const preselectedStylistId = searchParams.get("stylistId");

  const [salon,     setSalon]     = useState<PublicSalon | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);

  const [step, setStep]                       = useState(1);
  const [selectedStylist, setSelectedStylist] = useState<PublicStylist | null>(null);
  const [selectedServices, setSelectedServices] = useState<PublicService[]>([]);
  const [selectedDate, setSelectedDate]       = useState<string>(() => toLocalDateStr(new Date()));
  const [slots,       setSlots]               = useState<TimeSlot[]>([]);
  const [slotsLoading,setSlotsLoading]        = useState(false);
  const [selectedSlot, setSelectedSlot]       = useState<TimeSlot | null>(null);
  const [form, setForm] = useState({
    customerFirstName:"", customerLastName:"",
    customerPhone:"", customerEmail:"",
    customerNotes:"",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitErr,  setSubmitErr]  = useState("");
  const [bookingId,  setBookingId]  = useState("");

  // Waitlist state
  const [showWaitlist,    setShowWaitlist]    = useState(false);
  const [waitlistForm,    setWaitlistForm]    = useState({ firstName: "", lastName: "", phone: "", email: "", timeType: "flexible" as "flexible" | "specific", timeFrom: "09:00", timeTo: "11:00" });
  const [waitlistBusy,    setWaitlistBusy]    = useState(false);
  const [waitlistDone,    setWaitlistDone]    = useState(false);
  const [waitlistErr,     setWaitlistErr]     = useState("");

  useEffect(() => {
    fetch(`${API}/SalonWebsite/public/${slug}`)
      .then(r => { if (!r.ok) { setNotFound(true); return null; } return r.json(); })
      .then(d => {
        if (d) {
          const s = d.website ? { ...d.website, stylists: d.stylists ?? [], services: d.services ?? [] } : d;
          setSalon(s);
          const stylistList = d.stylists ?? d.website?.stylists ?? [];
          if (preselectedStylistId && stylistList.length) {
            const st = stylistList.find((x: PublicStylist) => x.id === preselectedStylistId);
            if (st) { setSelectedStylist(st); setStep(2); }
          }
        }
      })
      .finally(() => setLoading(false));
  }, [slug, preselectedStylistId]);

  const totalDuration = selectedServices.reduce((s, x) => s + x.durationMinutes, 0);
  const totalPrice    = selectedServices.reduce((s, x) => s + x.price, 0);

  // When entering step 3, jump to tomorrow if today's work hours are already past
  useEffect(() => {
    if (step !== 3) return;
    const now = new Date();
    const todayStr = toLocalDateStr(now);
    if (selectedDate === todayStr && now.getHours() >= 18) {
      setSelectedDate(toLocalDateStr(addDays(now, 1)));
    }
  }, [step]);

  useEffect(() => {
    if (!selectedStylist || !selectedDate || step !== 3) return;
    setSlotsLoading(true);
    setSelectedSlot(null);
    setSlots([]);
    const dur = totalDuration || 30;
    fetch(`${API}/SalonWebsite/public/${slug}/stylists/${selectedStylist.id}/slots?date=${selectedDate}&durationMinutes=${dur}&tzOffsetMinutes=${TZ_OFFSET}`)
      .then(r => r.ok ? r.json() : [])
      .then((d: TimeSlot[]) => setSlots(d))
      .finally(() => setSlotsLoading(false));
  }, [selectedStylist, selectedDate, slug, step, totalDuration]);

  const submit = async () => {
    if (!selectedSlot || !selectedStylist) return;
    setSubmitting(true); setSubmitErr("");
    try {
      const serviceName = selectedServices.length > 0
        ? selectedServices.map(s => s.name).join(", ")
        : "Genel Randevu";
      const res = await fetch(`${API}/AppointmentRequests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stylistId: selectedStylist.id,
          requestedStartUtc: selectedSlot.startUtc,
          requestedEndUtc:   selectedSlot.endUtc,
          serviceName,
          customerFirstName: form.customerFirstName,
          customerLastName:  form.customerLastName,
          customerPhone:     form.customerPhone,
          customerEmail:     form.customerEmail,
          customerNotes:     form.customerNotes,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Bir hata oluştu.");
      setBookingId(d.id ?? "");
      setStep(5);
      // Customer confirmation mail
      if (form.customerEmail) {
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: "booking_customer",
            to: form.customerEmail,
            subject: `Randevu Talebiniz Alındı — ${salon?.name ?? ""}`,
            data: {
              salonName:     salon?.name ?? "",
              stylistName:   selectedStylist.fullName,
              serviceName,
              startUtc:      selectedSlot.startUtc,
              customerFirstName: form.customerFirstName,
              salonPhone:    salon?.phone ?? "",
            },
          }),
        }).catch(() => {});
      }
      // Salon notification mail
      if (salon?.email) {
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: "booking_salon",
            to: salon.email,
            subject: `Yeni Randevu Talebi — ${form.customerFirstName} ${form.customerLastName}`,
            data: {
              salonName:     salon.name,
              stylistName:   selectedStylist.fullName,
              serviceName,
              startUtc:      selectedSlot.startUtc,
              customerFirstName: form.customerFirstName,
              customerLastName:  form.customerLastName,
              customerPhone:     form.customerPhone ?? "",
              customerEmail:     form.customerEmail ?? "",
              customerNotes:     form.customerNotes ?? "",
              panelUrl:      "https://xcut.xshield.com.tr/appointments",
            },
          }),
        }).catch(() => {});
      }
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally { setSubmitting(false); }
  };

  const submitWaitlist = async () => {
    if (!waitlistForm.firstName.trim() || !waitlistForm.phone.trim()) {
      setWaitlistErr("Ad ve telefon zorunludur."); return;
    }
    setWaitlistBusy(true); setWaitlistErr("");
    try {
      const serviceName = selectedServices.length > 0
        ? selectedServices.map(s => s.name).join(", ")
        : undefined;
      const isSpecific = waitlistForm.timeType === "specific";
      const res = await fetch(`${API}/Waitlist/public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug:              slug,
          customerFirstName: waitlistForm.firstName.trim(),
          customerLastName:  waitlistForm.lastName.trim() || undefined,
          customerPhone:     waitlistForm.phone.trim(),
          customerEmail:     waitlistForm.email.trim() || undefined,
          stylistId:         selectedStylist?.id,
          serviceName,
          waitingType:       isSpecific ? "fixed_slot" : "flexible",
          preferredDate:     selectedDate ? new Date(selectedDate).toISOString() : undefined,
          preferredTimeFrom: isSpecific ? waitlistForm.timeFrom : undefined,
          preferredTimeTo:   isSpecific ? waitlistForm.timeTo   : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || "Bir hata oluştu.");
      }
      setWaitlistDone(true);
    } catch (e: unknown) {
      setWaitlistErr(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally { setWaitlistBusy(false); }
  };

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#fafafa", fontFamily:"Inter, system-ui, sans-serif" }}>
      <div style={{ width:36, height:36, border:"3px solid #e5e7eb", borderTopColor:"#7c3aed", borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (notFound || !salon || !salon.bookingEnabled) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#fafafa", fontFamily:"Inter, system-ui, sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Online randevu kapalı</div>
        <Link href={`/site/${slug}`} style={{ color:"#7c3aed", fontSize:14 }}>← Salona dön</Link>
      </div>
    </div>
  );

  const primary   = salon.primaryColor ?? "#7c3aed";
  const onPrimary = isDark(primary) ? "#fff" : "#111827";
  const stylists  = salon.stylists ?? [];
  const allServices = salon.services ?? [];

  // Filter services to only those the selected stylist supports (if configured)
  const services = selectedStylist?.supportedServiceIds?.length
    ? allServices.filter(s => selectedStylist.supportedServiceIds!.includes(s.id))
    : allServices;

  const inp: React.CSSProperties = {
    width:"100%", padding:"10px 14px", borderRadius:8,
    border:"1px solid #e5e7eb", fontSize:14, boxSizing:"border-box",
    outline:"none", background:"white", color:"#111827",
  };

  /* ── Week strip helpers ── */
  const today       = new Date();
  const weekDates   = Array.from({length:14}, (_,i) => addDays(today, i));
  const selDateObj  = new Date(selectedDate + "T12:00:00");

  /* ── Group slots by hour for display ── */
  const slotsByHour = slots.reduce<Record<number, TimeSlot[]>>((acc, s) => {
    const h = new Date(s.startUtc).getHours();
    if (!acc[h]) acc[h] = [];
    acc[h].push(s);
    return acc;
  }, {});
  const hours = Object.keys(slotsByHour).map(Number).sort((a,b)=>a-b);

  return (
    <div style={{ minHeight:"100vh", background:"#fafafa", fontFamily:"Inter, system-ui, -apple-system, sans-serif", color:"#111827" }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        input:focus,textarea:focus{border-color:${primary} !important; box-shadow:0 0 0 3px ${primary}18 !important;}
        .slot-btn:hover:not(:disabled){border-color:${primary} !important; background:${primary}0a !important;}
      `}</style>

      {/* Header */}
      <header style={{ background:"white", borderBottom:"1px solid #f3f4f6", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ maxWidth:1000, margin:"0 auto", padding:"0 24px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <Link href={`/site/${slug}`} style={{ fontWeight:800, fontSize:17, color:primary, textDecoration:"none", display:"flex", alignItems:"center", gap:8 }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            {salon.name}
          </Link>
          <span style={{ fontSize:14, fontWeight:600, color:"#6b7280" }}>Online Randevu</span>
        </div>
      </header>

      {/* Step progress */}
      <div style={{ background:"white", borderBottom:"1px solid #f3f4f6" }}>
        <div style={{ maxWidth:640, margin:"0 auto", padding:"16px 24px" }}>
          <div style={{ display:"flex", alignItems:"center" }}>
            {STEP_LABELS.map((label, i) => {
              const num = i+1;
              const done = step > num;
              const active = step === num;
              return (
                <div key={label} style={{ display:"flex", alignItems:"center", flex: i < STEP_LABELS.length-1 ? "1 1 auto" : undefined }}>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
                    <div style={{
                      width:28, height:28, borderRadius:"50%",
                      background: done ? "#16a34a" : active ? primary : "#f3f4f6",
                      color: done || active ? (done ? "#fff" : onPrimary) : "#9ca3af",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:11, fontWeight:700, transition:"all 0.2s",
                    }}>
                      {done ? <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg> : num}
                    </div>
                    <span style={{ fontSize:9, fontWeight: active ? 700 : 400, color: active ? primary : "#9ca3af", marginTop:4, whiteSpace:"nowrap" }}>
                      {label}
                    </span>
                  </div>
                  {i < STEP_LABELS.length-1 && (
                    <div style={{ flex:1, height:2, background: done ? "#16a34a" : "#f3f4f6", margin:"0 6px", marginBottom:18, transition:"background 0.2s" }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:640, margin:"0 auto", padding:"32px 24px 80px" }}>

        {/* ── STEP 1: Stilist ── */}
        {step === 1 && (
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:"-0.4px", marginBottom:6 }}>Stilist Seçin</h1>
            <p style={{ color:"#6b7280", fontSize:14, marginBottom:24 }}>Randevu almak istediğiniz stilisti seçin</p>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {stylists.map(s => {
                const photoSrc = s.photoUrl ? `${API.replace("/api","")}${s.photoUrl}` : null;
                return (
                  <button key={s.id} onClick={() => { setSelectedStylist(s); setStep(2); }}
                    style={{ display:"flex", alignItems:"center", gap:16, padding:"16px 20px", background:"white", borderRadius:12, cursor:"pointer", border:"1.5px solid #e5e7eb", textAlign:"left", width:"100%" }}>
                    <div style={{ width:50, height:50, borderRadius:10, flexShrink:0, background:`${primary}10`, overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {photoSrc
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={photoSrc} alt={s.fullName} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                        : <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      }
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:15 }}>{s.fullName}</div>
                      {s.specialty && <div style={{ fontSize:13, color:primary, fontWeight:500, marginTop:2 }}>{s.specialty}</div>}
                    </div>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                  </button>
                );
              })}
              {stylists.length === 0 && (
                <div style={{ textAlign:"center", padding:48, background:"white", borderRadius:12, border:"1px solid #f3f4f6", color:"#9ca3af" }}>Aktif stilist bulunamadı.</div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: Hizmet ── */}
        {step === 2 && selectedStylist && (
          <div>
            <button onClick={() => { setStep(1); setSelectedServices([]); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, fontWeight:600, color:"#6b7280", padding:0, marginBottom:20, display:"flex", alignItems:"center", gap:6 }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
              Stilist değiştir
            </button>

            {/* Selected stylist chip */}
            <div style={{ display:"flex", gap:12, alignItems:"center", padding:"12px 16px", borderRadius:10, marginBottom:24, background:`${primary}08`, border:`1px solid ${primary}20` }}>
              <div style={{ width:32, height:32, borderRadius:8, background:`${primary}18`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:13 }}>{selectedStylist.fullName}</div>
                {selectedStylist.specialty && <div style={{ fontSize:12, color:primary }}>{selectedStylist.specialty}</div>}
              </div>
            </div>

            <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:"-0.4px", marginBottom:6 }}>Hizmet Seçin</h1>
            <p style={{ color:"#6b7280", fontSize:14, marginBottom:24 }}>Yaptırmak istediğiniz hizmetleri seçin (birden fazla seçebilirsiniz)</p>

            {services.length === 0 ? (
              <div style={{ textAlign:"center", padding:40, background:"white", borderRadius:12, border:"1px solid #f3f4f6", color:"#9ca3af", fontSize:14, marginBottom:20 }}>
                Bu salon için hizmet listesi tanımlı değil.
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:20, marginBottom:24 }}>
                {Array.from(new Set(services.map(s => s.category))).map(cat => (
                  <div key={cat}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>{cat}</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {services.filter(s => s.category === cat).map(svc => {
                        const sel = selectedServices.some(x => x.id === svc.id);
                        return (
                          <button key={svc.id}
                            onClick={() => setSelectedServices(prev => sel ? prev.filter(x => x.id !== svc.id) : [...prev, svc])}
                            style={{
                              display:"flex", alignItems:"center", gap:14, padding:"14px 16px",
                              background:"white", borderRadius:10, cursor:"pointer",
                              border:`1.5px solid ${sel ? primary : "#e5e7eb"}`,
                              boxShadow: sel ? `0 0 0 3px ${primary}14` : "none",
                              textAlign:"left", width:"100%", transition:"all 0.12s",
                            }}>
                            <div style={{
                              width:22, height:22, borderRadius:6, flexShrink:0,
                              border:`2px solid ${sel ? primary : "#d1d5db"}`,
                              background: sel ? primary : "white",
                              display:"flex", alignItems:"center", justifyContent:"center",
                              transition:"all 0.12s",
                            }}>
                              {sel && <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontWeight:600, fontSize:14, color:"#111827" }}>{svc.name}</div>
                              <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>⏱ {fmtDuration(svc.durationMinutes)}</div>
                            </div>
                            {svc.price > 0 && <div style={{ fontSize:14, fontWeight:700, color:primary, flexShrink:0 }}>₺{svc.price.toLocaleString("tr-TR")}</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Summary bar */}
            {selectedServices.length > 0 && (
              <div style={{ padding:"12px 16px", borderRadius:10, background:"#f0fdf4", border:"1px solid #bbf7d0", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                <div style={{ fontSize:13, color:"#166534" }}>
                  <strong>{selectedServices.length} hizmet</strong> seçildi
                </div>
                <div style={{ display:"flex", gap:16, fontSize:13, fontWeight:600, color:"#166534" }}>
                  <span>⏱ {fmtDuration(totalDuration)}</span>
                  {totalPrice > 0 && <span>₺{totalPrice.toLocaleString("tr-TR")}</span>}
                </div>
              </div>
            )}

            <button
              onClick={() => setStep(3)}
              disabled={selectedServices.length === 0 && services.length > 0}
              style={{
                width:"100%", padding:"14px 0", borderRadius:10,
                background: (selectedServices.length === 0 && services.length > 0) ? "#e5e7eb" : primary,
                border:"none", color: (selectedServices.length === 0 && services.length > 0) ? "#9ca3af" : onPrimary,
                fontWeight:700, fontSize:15, cursor: (selectedServices.length === 0 && services.length > 0) ? "not-allowed" : "pointer",
              }}>
              {services.length === 0 ? "Devam Et →" : selectedServices.length > 0 ? "Tarih Seç →" : "Hizmet seçiniz"}
            </button>
          </div>
        )}

        {/* ── STEP 3: Takvim ── */}
        {step === 3 && selectedStylist && (
          <div>
            <button onClick={() => { setStep(2); setSelectedSlot(null); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, fontWeight:600, color:"#6b7280", padding:0, marginBottom:20, display:"flex", alignItems:"center", gap:6 }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
              Geri
            </button>

            {/* Stilist + hizmet özeti */}
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:20 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", borderRadius:20, background:`${primary}10`, border:`1px solid ${primary}20` }}>
                <div style={{ width:20, height:20, borderRadius:"50%", background:primary, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </div>
                <span style={{ fontSize:13, fontWeight:600, color:primary }}>{selectedStylist.fullName}</span>
              </div>
              {selectedServices.map(s => (
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:20, background:"#f0fdf4", border:"1px solid #bbf7d0" }}>
                  <span style={{ fontSize:13, fontWeight:600, color:"#166534" }}>{s.name}</span>
                  <span style={{ fontSize:11, color:"#6b7280" }}>· {fmtDuration(s.durationMinutes)}</span>
                </div>
              ))}
            </div>

            <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:"-0.4px", marginBottom:6 }}>Tarih Seçin</h1>
            <p style={{ color:"#6b7280", fontSize:14, marginBottom:20 }}>
              Uygun gün ve saati seçin
              {totalDuration > 0 && <span style={{ color:primary, fontWeight:600 }}> · {fmtDuration(totalDuration)}</span>}
            </p>

            {/* Date strip */}
            <div style={{ overflowX:"auto", marginBottom:24 }}>
              <div style={{ display:"flex", gap:8, minWidth:"max-content", paddingBottom:4 }}>
                {weekDates.map(d => {
                  const ds = toLocalDateStr(d);
                  const isSelected = ds === selectedDate;
                  const isToday = ds === toLocalDateStr(today);
                  return (
                    <button key={ds} onClick={() => setSelectedDate(ds)}
                      style={{
                        display:"flex", flexDirection:"column", alignItems:"center",
                        padding:"10px 14px", borderRadius:12, border:"none",
                        background: isSelected ? primary : isToday ? `${primary}12` : "white",
                        color: isSelected ? onPrimary : isToday ? primary : "#374151",
                        cursor:"pointer", fontWeight: isSelected || isToday ? 700 : 500,
                        boxShadow: isSelected ? `0 4px 12px ${primary}30` : "0 1px 3px rgba(0,0,0,0.06)",
                        transition:"all 0.12s", minWidth:60,
                      }}>
                      <span style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", opacity: isSelected ? 0.85 : 0.6 }}>
                        {TR_DAYS[d.getDay()]}
                      </span>
                      <span style={{ fontSize:20, fontWeight:800, lineHeight:1.2, marginTop:2 }}>{d.getDate()}</span>
                      <span style={{ fontSize:10, opacity: isSelected ? 0.8 : 0.5 }}>{TR_MONTHS[d.getMonth()]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Timeline */}
            <div style={{ background:"white", borderRadius:16, border:"1px solid #f3f4f6", overflow:"hidden" }}>
              <div style={{ padding:"14px 20px", borderBottom:"1px solid #f3f4f6", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontWeight:700, fontSize:14 }}>
                  {fmtFullDate(selDateObj)}
                </span>
                {totalDuration > 0 && (
                  <span style={{ fontSize:12, color:"#6b7280", background:"#f8fafc", padding:"3px 10px", borderRadius:20, border:"1px solid #e5e7eb" }}>
                    Hizmet süresi: {fmtDuration(totalDuration)}
                  </span>
                )}
              </div>

              <div style={{ padding:"8px 0 16px" }}>
                {slotsLoading ? (
                  <div style={{ textAlign:"center", padding:48, color:"#9ca3af", fontSize:14 }}>
                    <div style={{ width:28, height:28, border:"3px solid #e5e7eb", borderTopColor:primary, borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }}/>
                    Müsait saatler yükleniyor...
                  </div>
                ) : slots.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"36px 24px", color:"#9ca3af", fontSize:14 }}>
                    <div style={{ fontSize:32, marginBottom:12 }}>📅</div>
                    Bu gün için müsait saat yok.<br/>
                    <span style={{ fontSize:13 }}>Lütfen farklı bir gün seçin.</span>
                    {!waitlistDone && (
                      <div style={{ marginTop:24 }}>
                        <button onClick={() => setShowWaitlist(w => !w)}
                          style={{ padding:"10px 20px", borderRadius:10, border:`1.5px solid ${primary}`, background:"transparent", color:primary, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                          {showWaitlist ? "Vazgeç" : "🔔 Bekleme listesine eklen"}
                        </button>
                      </div>
                    )}
                    {waitlistDone && (
                      <div style={{ marginTop:20, padding:"14px 20px", borderRadius:12, background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#166534", fontWeight:600, fontSize:14 }}>
                        ✅ Bekleme listesine eklendiniz! Uygun slot açıldığında bildirim alacaksınız.
                      </div>
                    )}
                  </div>
                ) : hours.map(h => (
                  <div key={h}>
                    {/* Hour label */}
                    <div style={{ padding:"8px 20px 4px", display:"flex", alignItems:"center", gap:12 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:"#9ca3af", minWidth:40 }}>{String(h).padStart(2,"0")}:00</span>
                      <div style={{ flex:1, height:1, background:"#f3f4f6" }}/>
                    </div>
                    {/* Slots for this hour */}
                    <div style={{ padding:"0 20px", display:"flex", flexWrap:"wrap", gap:8 }}>
                      {slotsByHour[h].map(s => {
                        const isSelected = selectedSlot?.startUtc === s.startUtc;
                        const localHour = new Date(s.startUtc).getHours();
                        const localMin  = new Date(s.startUtc).getMinutes();
                        if (localHour !== h) return null;
                        return (
                          <button key={s.startUtc}
                            className="slot-btn"
                            disabled={!s.available}
                            onClick={() => setSelectedSlot(s)}
                            style={{
                              padding:"8px 16px", borderRadius:8, fontSize:13, fontWeight:600,
                              border:`1.5px solid ${isSelected ? primary : s.available ? "#d1fae5" : "#f3f4f6"}`,
                              background: isSelected ? primary : s.available ? "#f0fdf4" : "#fafafa",
                              color: isSelected ? onPrimary : s.available ? "#166534" : "#d1d5db",
                              cursor: s.available ? "pointer" : "not-allowed",
                              transition:"all 0.12s",
                              textDecoration: !s.available ? "line-through" : "none",
                            }}>
                            {String(localHour).padStart(2,"0")}:{String(localMin).padStart(2,"0")}
                            {!s.available && <span style={{ marginLeft:4, fontSize:10 }}>Dolu</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Amber banner — only when ALL slots are full */}
            {!slotsLoading && slots.length > 0 && slots.every(s => !s.available) && !waitlistDone && (
              <div style={{ margin:"16px 0 0", padding:"16px 20px", borderRadius:12, background:"#fffbeb", border:"1px solid #fde68a" }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#92400e", marginBottom:10 }}>
                  🔔 Tüm slotlar dolu. Bekleme listesine eklenin — uygun slot açılınca bildirim alırsınız.
                </div>
                <button onClick={() => setShowWaitlist(w => !w)}
                  style={{ fontSize:12, fontWeight:700, color:"#92400e", background:"none", border:"1px solid #fcd34d", borderRadius:8, padding:"6px 14px", cursor:"pointer" }}>
                  {showWaitlist ? "Kapat" : "Listeye Eklen"}
                </button>
              </div>
            )}

            {/* Subtle waitlist link — always visible when some slots exist, even if some are available */}
            {!slotsLoading && slots.length > 0 && !slots.every(s => !s.available) && !showWaitlist && !waitlistDone && (
              <div style={{ marginTop:16, textAlign:"center" }}>
                <button onClick={() => setShowWaitlist(true)}
                  style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"#6b7280", textDecoration:"underline", textDecorationStyle:"dotted", textUnderlineOffset:3, padding:"6px 8px" }}>
                  İstediğiniz saat dolu mu? Bekleme listesine eklenin →
                </button>
              </div>
            )}

            {showWaitlist && !waitlistDone && (
              <div style={{ margin:"12px 0", padding:"18px 20px", borderRadius:12, background:"#fafaf9", border:`1px solid ${primary}30` }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"#111827" }}>🔔 Bekleme Listesine Eklen</div>

                {/* Name + phone + email */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                  <div>
                    <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#6b7280", marginBottom:4, textTransform:"uppercase" }}>Ad *</label>
                    <input value={waitlistForm.firstName} onChange={e => setWaitlistForm(p => ({ ...p, firstName: e.target.value }))}
                      placeholder="Adınız" style={inp} />
                  </div>
                  <div>
                    <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#6b7280", marginBottom:4, textTransform:"uppercase" }}>Soyad</label>
                    <input value={waitlistForm.lastName} onChange={e => setWaitlistForm(p => ({ ...p, lastName: e.target.value }))}
                      placeholder="Soyadınız" style={inp} />
                  </div>
                  <div>
                    <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#6b7280", marginBottom:4, textTransform:"uppercase" }}>Telefon *</label>
                    <input value={waitlistForm.phone} onChange={e => setWaitlistForm(p => ({ ...p, phone: e.target.value }))}
                      placeholder="+90 500 000 0000" style={inp} />
                  </div>
                  <div>
                    <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#6b7280", marginBottom:4, textTransform:"uppercase" }}>E-posta</label>
                    <input value={waitlistForm.email} onChange={e => setWaitlistForm(p => ({ ...p, email: e.target.value }))}
                      placeholder="ornek@email.com" style={inp} />
                  </div>
                </div>

                {/* Time preference */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", marginBottom:8, textTransform:"uppercase" }}>Saat Tercihi</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {(["flexible", "specific"] as const).map(opt => (
                      <label key={opt} style={{ display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer", padding:"10px 12px", borderRadius:10, border:`1.5px solid ${waitlistForm.timeType === opt ? primary : "#e5e7eb"}`, background: waitlistForm.timeType === opt ? `${primary}08` : "#fff" }}>
                        <input type="radio" name="timeType" value={opt} checked={waitlistForm.timeType === opt}
                          onChange={() => setWaitlistForm(p => ({ ...p, timeType: opt }))}
                          style={{ marginTop:2, accentColor: primary }} />
                        <div>
                          <div style={{ fontWeight:700, fontSize:13, color:"#111827" }}>
                            {opt === "flexible" ? "🕐 Günün herhangi bir saati" : "🎯 Belirli bir saat aralığı"}
                          </div>
                          <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>
                            {opt === "flexible"
                              ? `${selectedDate ? new Date(selectedDate).toLocaleDateString("tr-TR", { day:"numeric", month:"long" }) : "Seçili gün"}de uygun olan her saate razıyım`
                              : "Yalnızca belli saatler arasında gelebilirim"}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {waitlistForm.timeType === "specific" && (
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:12 }}>
                      <div style={{ flex:1 }}>
                        <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#6b7280", marginBottom:4, textTransform:"uppercase" }}>Başlangıç</label>
                        <input type="time" value={waitlistForm.timeFrom}
                          onChange={e => setWaitlistForm(p => ({ ...p, timeFrom: e.target.value }))}
                          style={inp} />
                      </div>
                      <div style={{ paddingTop:22, color:"#9ca3af", fontWeight:700 }}>—</div>
                      <div style={{ flex:1 }}>
                        <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#6b7280", marginBottom:4, textTransform:"uppercase" }}>Bitiş</label>
                        <input type="time" value={waitlistForm.timeTo}
                          onChange={e => setWaitlistForm(p => ({ ...p, timeTo: e.target.value }))}
                          style={inp} />
                      </div>
                    </div>
                  )}
                </div>

                {waitlistErr && <div style={{ fontSize:12, color:"#dc2626", marginBottom:10 }}>{waitlistErr}</div>}
                <button onClick={submitWaitlist} disabled={waitlistBusy}
                  style={{ width:"100%", padding:"12px 0", borderRadius:10, border:"none", background:primary, color:onPrimary, fontWeight:700, fontSize:14, cursor:"pointer", opacity: waitlistBusy ? 0.7 : 1 }}>
                  {waitlistBusy ? "Ekleniyor..." : "Bekleme Listesine Eklen"}
                </button>
              </div>
            )}

            {selectedSlot && (
              <div style={{ marginTop:20 }}>
                <div style={{ padding:"14px 18px", borderRadius:12, background:`${primary}08`, border:`1px solid ${primary}20`, marginBottom:16, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#111827" }}>{fmtDate(selectedSlot.startUtc)}</div>
                    <div style={{ fontSize:12, color:"#6b7280" }}>{fmtTime(selectedSlot.startUtc)} – {fmtTime(selectedSlot.endUtc)}</div>
                  </div>
                </div>
                <button onClick={() => setStep(4)} style={{
                  width:"100%", padding:"14px 0", borderRadius:10,
                  background:primary, border:"none", color:onPrimary,
                  fontWeight:700, fontSize:15, cursor:"pointer",
                }}>
                  Bilgilerimi Gir →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Bilgiler ── */}
        {step === 4 && selectedStylist && selectedSlot && (
          <div>
            <button onClick={() => setStep(3)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, fontWeight:600, color:"#6b7280", padding:0, marginBottom:20, display:"flex", alignItems:"center", gap:6 }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
              Geri
            </button>

            <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:"-0.4px", marginBottom:6 }}>Bilgilerinizi Girin</h1>
            <p style={{ color:"#6b7280", fontSize:14, marginBottom:24 }}>Randevu onayı için iletişim bilgileriniz gereklidir</p>

            {/* Summary */}
            <div style={{ background:"white", borderRadius:12, padding:"16px 20px", marginBottom:28, border:"1px solid #f3f4f6" }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:12 }}>Randevu Özeti</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <div style={{ display:"flex", gap:8, fontSize:14 }}>
                  <span style={{ color:"#9ca3af", minWidth:80, flexShrink:0 }}>Stilist</span>
                  <span style={{ fontWeight:600 }}>{selectedStylist.fullName}</span>
                </div>
                {selectedServices.length > 0 && (
                  <div style={{ display:"flex", gap:8, fontSize:14 }}>
                    <span style={{ color:"#9ca3af", minWidth:80, flexShrink:0 }}>Hizmet</span>
                    <span style={{ fontWeight:600 }}>{selectedServices.map(s=>s.name).join(", ")}</span>
                  </div>
                )}
                <div style={{ display:"flex", gap:8, fontSize:14 }}>
                  <span style={{ color:"#9ca3af", minWidth:80, flexShrink:0 }}>Tarih</span>
                  <span style={{ fontWeight:600 }}>{fmtDate(selectedSlot.startUtc)}</span>
                </div>
                <div style={{ display:"flex", gap:8, fontSize:14 }}>
                  <span style={{ color:"#9ca3af", minWidth:80, flexShrink:0 }}>Saat</span>
                  <span style={{ fontWeight:600 }}>{fmtTime(selectedSlot.startUtc)} – {fmtTime(selectedSlot.endUtc)}</span>
                </div>
                {totalDuration > 0 && (
                  <div style={{ display:"flex", gap:8, fontSize:14 }}>
                    <span style={{ color:"#9ca3af", minWidth:80, flexShrink:0 }}>Süre</span>
                    <span style={{ fontWeight:600 }}>{fmtDuration(totalDuration)}</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              {([
                { key:"customerFirstName", label:"Ad *",    placeholder:"Adınız" },
                { key:"customerLastName",  label:"Soyad *", placeholder:"Soyadınız" },
                { key:"customerPhone",     label:"Telefon", placeholder:"+90 500 000 0000" },
                { key:"customerEmail",     label:"E-posta", placeholder:"ornek@email.com" },
              ] as {key: keyof typeof form; label: string; placeholder: string}[]).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>{label}</label>
                  <input value={form[key]} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))} placeholder={placeholder} style={inp}/>
                </div>
              ))}
              <div style={{ gridColumn:"span 2" }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>Ek Notlar</label>
                <textarea value={form.customerNotes} onChange={e => setForm(prev => ({ ...prev, customerNotes: e.target.value }))} placeholder="Salon ekibine iletmek istediğiniz bilgiler..." rows={3} style={{ ...inp, resize:"vertical" }}/>
              </div>
            </div>

            {submitErr && (
              <div style={{ marginTop:16, padding:"12px 16px", background:"#fef2f2", borderRadius:8, color:"#dc2626", fontSize:13, fontWeight:500 }}>{submitErr}</div>
            )}

            <button onClick={submit} disabled={submitting || !form.customerFirstName || !form.customerLastName}
              style={{
                width:"100%", marginTop:24, padding:"14px 0", borderRadius:10,
                background:primary, border:"none", color:onPrimary,
                fontWeight:700, fontSize:15, cursor:"pointer",
                opacity: (submitting || !form.customerFirstName || !form.customerLastName) ? 0.6 : 1,
              }}>
              {submitting ? "Gönderiliyor..." : "Randevu Talebini Gönder"}
            </button>
            <p style={{ fontSize:12, color:"#9ca3af", textAlign:"center", marginTop:12 }}>
              Talebiniz salon tarafından onaylandıktan sonra bildirim alacaksınız.
            </p>
          </div>
        )}

        {/* ── STEP 5: Tamamlandı ── */}
        {step === 5 && (
          <div style={{ textAlign:"center", padding:"40px 0" }}>
            <div style={{ width:72, height:72, borderRadius:"50%", background:"#f0fdf4", border:"2px solid #bbf7d0", margin:"0 auto 28px", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
            </div>
            <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:"-0.4px", marginBottom:12 }}>Talebiniz Alındı</h1>
            <p style={{ color:"#6b7280", fontSize:15, maxWidth:400, margin:"0 auto 28px", lineHeight:1.65 }}>
              Salon ekibimiz talebinizi en kısa sürede inceleyecek ve sizinle iletişime geçecektir.
              {form.customerEmail && <> <strong style={{ color:"#374151" }}>{form.customerEmail}</strong> adresine bilgi gönderildi.</>}
            </p>
            {bookingId && (
              <div style={{ display:"inline-flex", alignItems:"center", gap:10, padding:"10px 20px", borderRadius:8, background:"white", border:"1px solid #f3f4f6", marginBottom:36 }}>
                <span style={{ fontSize:12, color:"#9ca3af", fontWeight:500 }}>Talep No</span>
                <code style={{ fontSize:13, fontWeight:700, color:"#111827", fontFamily:"monospace" }}>{bookingId.slice(0,8).toUpperCase()}</code>
              </div>
            )}
            <div>
              <Link href={`/site/${slug}`} style={{ display:"inline-block", padding:"12px 28px", borderRadius:10, background:primary, color:onPrimary, fontWeight:700, fontSize:14, textDecoration:"none" }}>
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
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Inter, system-ui, sans-serif" }}>
        <div style={{ width:36, height:36, border:"3px solid #e5e7eb", borderTopColor:"#7c3aed", borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <BookPageInner />
    </Suspense>
  );
}
