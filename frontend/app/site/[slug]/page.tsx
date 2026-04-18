"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type PublicStylist = {
  id: string;
  fullName: string;
  specialty?: string;
  biography?: string;
  photoUrl?: string;
  specializations?: string;
  experienceYears?: number;
  avgRating?: number;
  reviewCount?: number;
};

type PublicSalon = {
  name: string;
  slug: string;
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
  showReviews?: boolean;
  bookingEnabled?: boolean;
  stylists?: PublicStylist[];
};

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";

function GlobalStyles({ primary }: { primary: string }) {
  useEffect(() => {
    document.documentElement.style.setProperty("--primary", primary);
    const r = parseInt(primary.slice(1, 3), 16);
    const g = parseInt(primary.slice(3, 5), 16);
    const b = parseInt(primary.slice(5, 7), 16);
    document.documentElement.style.setProperty("--primary-rgb", `${r},${g},${b}`);
  }, [primary]);
  return null;
}

function isDark(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}

function Stars({ rating }: { rating: number }) {
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} width="14" height="14" viewBox="0 0 24 24" fill={n <= Math.round(rating) ? "#f59e0b" : "#e5e7eb"}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginLeft: 4 }}>{rating.toFixed(1)}</span>
    </div>
  );
}

export default function PublicSalonPage() {
  const { slug } = useParams<{ slug: string }>();
  const [salon, setSalon]     = useState<PublicSalon | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`${API}/SalonWebsite/public/${slug}`)
      .then(r => { if (!r.ok) { setNotFound(true); return null; } return r.json(); })
      .then(d => { if (d) setSalon(d); })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa" }}>
      <div style={{ width: 40, height: 40, border: "3px solid #e5e7eb", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (notFound || !salon) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ width: 64, height: 64, background: "#f3f4f6", borderRadius: 16, margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Sayfa Bulunamadı</h1>
        <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6 }}>Bu adres geçerli değil veya site henüz yayınlanmamış.</p>
      </div>
    </div>
  );

  const primary = salon.primaryColor ?? "#7c3aed";
  const onPrimary = isDark(primary) ? "#ffffff" : "#111827";
  const stylists = salon.stylists ?? [];

  return (
    <div style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#111827", lineHeight: 1.6 }}>
      <GlobalStyles primary={primary} />

      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #f3f4f6",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="#" style={{ fontWeight: 800, fontSize: 18, color: primary, textDecoration: "none", letterSpacing: "-0.4px" }}>
            {salon.name}
          </a>
          <nav style={{ display: "flex", gap: 32, alignItems: "center" }}>
            {stylists.length > 0 && (
              <a href="#stylists" style={{ fontSize: 14, fontWeight: 500, color: "#374151", textDecoration: "none" }}>Stilistlerimiz</a>
            )}
            {salon.aboutText && (
              <a href="#about" style={{ fontSize: 14, fontWeight: 500, color: "#374151", textDecoration: "none" }}>Hakkımızda</a>
            )}
            <a href="#contact" style={{ fontSize: 14, fontWeight: 500, color: "#374151", textDecoration: "none" }}>İletişim</a>
            {salon.bookingEnabled && (
              <Link href={`/site/${slug}/book`} style={{
                padding: "9px 22px", borderRadius: 8, textDecoration: "none",
                background: primary, color: onPrimary,
                fontWeight: 600, fontSize: 14, letterSpacing: "-0.2px",
                transition: "opacity 0.15s",
              }}>
                Randevu Al
              </Link>
            )}
          </nav>
        </div>
      </header>

      <section style={{
        position: "relative", minHeight: 580,
        display: "flex", alignItems: "center",
        background: salon.heroImageUrl
          ? `url(${salon.heroImageUrl}) center/cover no-repeat`
          : `linear-gradient(135deg, ${primary}10 0%, ${primary}05 100%)`,
        overflow: "hidden",
      }}>
        {salon.heroImageUrl && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.48)" }} />
        )}
        {!salon.heroImageUrl && (
          <div style={{
            position: "absolute", right: -80, top: -80,
            width: 500, height: 500, borderRadius: "50%",
            background: `${primary}0a`, pointerEvents: "none",
          }} />
        )}

        <div style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "80px 24px", width: "100%" }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "5px 14px", borderRadius: 999,
              background: salon.heroImageUrl ? "rgba(255,255,255,0.15)" : `${primary}14`,
              border: salon.heroImageUrl ? "1px solid rgba(255,255,255,0.25)" : `1px solid ${primary}30`,
              color: salon.heroImageUrl ? "rgba(255,255,255,0.9)" : primary,
              fontSize: 12, fontWeight: 600, letterSpacing: "0.5px",
              textTransform: "uppercase", marginBottom: 24,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
              Online Randevu Al
            </div>

            <h1 style={{
              fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800,
              lineHeight: 1.15, letterSpacing: "-1px",
              color: salon.heroImageUrl ? "#fff" : "#111827",
              marginBottom: 20,
            }}>
              {salon.heroTitle ?? salon.name}
            </h1>

            {salon.heroSubtitle && (
              <p style={{
                fontSize: 18, lineHeight: 1.65, fontWeight: 400,
                color: salon.heroImageUrl ? "rgba(255,255,255,0.82)" : "#4b5563",
                marginBottom: 36, maxWidth: 520,
              }}>
                {salon.heroSubtitle}
              </p>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {salon.bookingEnabled && (
                <Link href={`/site/${slug}/book`} style={{
                  padding: "14px 32px", borderRadius: 10, textDecoration: "none",
                  background: primary, color: onPrimary,
                  fontWeight: 700, fontSize: 15, letterSpacing: "-0.3px",
                  boxShadow: `0 4px 24px rgba(var(--primary-rgb,124,58,237),0.25)`,
                }}>
                  Randevu Al
                </Link>
              )}
              {salon.phone && (
                <a href={`tel:${salon.phone}`} style={{
                  padding: "14px 28px", borderRadius: 10, textDecoration: "none",
                  background: salon.heroImageUrl ? "rgba(255,255,255,0.15)" : "white",
                  border: salon.heroImageUrl ? "1px solid rgba(255,255,255,0.3)" : "1px solid #e5e7eb",
                  color: salon.heroImageUrl ? "#fff" : "#374151",
                  fontWeight: 600, fontSize: 15,
                }}>
                  {salon.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {stylists.length > 0 && (
        <div style={{ background: "white", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
            <div style={{ display: "flex", gap: 0 }}>
              {[
                { value: `${stylists.length}`, label: "Uzman Stilist" },
                { value: "7/24", label: "Müşteri Desteği" },
                { value: "Online", label: "Randevu Sistemi" },
                { value: "Kaliteli", label: "Hizmet Garantisi" },
              ].map(({ value, label }, i) => (
                <div key={i} style={{
                  flex: 1, padding: "24px 16px", textAlign: "center",
                  borderRight: i < 3 ? "1px solid #f3f4f6" : "none",
                }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: primary, letterSpacing: "-0.5px" }}>{value}</div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4, fontWeight: 500 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {stylists.length > 0 && (
        <section id="stylists" style={{ padding: "96px 24px", background: "#fafafa" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: primary, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>
                Ekibimiz
              </p>
              <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 16, color: "#111827" }}>
                Uzman Stilistlerimiz
              </h2>
              <p style={{ fontSize: 16, color: "#6b7280", maxWidth: 480, margin: "0 auto" }}>
                Alanında deneyimli stilistlerimizle en iyi hizmeti sunuyoruz.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
              {stylists.map(s => {
                const photoSrc = s.photoUrl ? `${API.replace("/api","")}${s.photoUrl}` : null;
                const specs = s.specializations?.split(",").map(x => x.trim()).filter(Boolean) ?? [];
                return (
                  <div key={s.id} style={{
                    background: "white", borderRadius: 16,
                    border: "1px solid #f3f4f6", overflow: "hidden",
                    transition: "box-shadow 0.2s, transform 0.2s",
                  }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 12px 40px rgba(0,0,0,0.08)";
                      (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                      (e.currentTarget as HTMLDivElement).style.transform = "none";
                    }}
                  >
                    <div style={{ height: 220, background: `${primary}10`, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {photoSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoSrc} alt={s.fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: 0.4 }}>
                          <svg width="56" height="56" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    <div style={{ padding: "20px 22px" }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, letterSpacing: "-0.3px" }}>{s.fullName}</h3>
                      {s.specialty && (
                        <p style={{ fontSize: 13, fontWeight: 600, color: primary, marginBottom: 10 }}>{s.specialty}</p>
                      )}

                      {s.avgRating !== null && s.avgRating !== undefined && salon.showReviews && (
                        <div style={{ marginBottom: 12 }}>
                          <Stars rating={s.avgRating} />
                          {s.reviewCount && s.reviewCount > 0 && (
                            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>({s.reviewCount} değerlendirme)</span>
                          )}
                        </div>
                      )}

                      {s.experienceYears && s.experienceYears > 0 && (
                        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>{s.experienceYears} yıl deneyim</p>
                      )}

                      {specs.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                          {specs.slice(0, 3).map(sp => (
                            <span key={sp} style={{
                              padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                              background: `${primary}0f`, color: primary, border: `1px solid ${primary}20`,
                            }}>{sp}</span>
                          ))}
                        </div>
                      )}

                      {s.biography && (
                        <p style={{
                          fontSize: 13, color: "#6b7280", lineHeight: 1.55, marginBottom: 18,
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                        }}>
                          {s.biography}
                        </p>
                      )}

                      {salon.bookingEnabled && (
                        <Link href={`/site/${slug}/book?stylistId=${s.id}`} style={{
                          display: "block", padding: "10px 0", borderRadius: 8, textAlign: "center",
                          background: "transparent", border: `1.5px solid ${primary}`,
                          color: primary, fontWeight: 600, fontSize: 13, textDecoration: "none",
                          transition: "all 0.15s",
                        }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLAnchorElement).style.background = primary;
                            (e.currentTarget as HTMLAnchorElement).style.color = onPrimary;
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                            (e.currentTarget as HTMLAnchorElement).style.color = primary;
                          }}
                        >
                          Randevu Al
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {salon.aboutText && (
        <section id="about" style={{ padding: "96px 24px", background: "white" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: primary, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 16 }}>
                Hakkımızda
              </p>
              <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 24, lineHeight: 1.2, color: "#111827" }}>
                {salon.name}
              </h2>
              <p style={{ fontSize: 16, color: "#4b5563", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                {salon.aboutText}
              </p>
            </div>
            <div style={{ background: `${primary}07`, borderRadius: 20, padding: 48, border: `1px solid ${primary}15` }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                {[
                  { title: "Uzman Kadro", desc: "Alanında deneyimli, sürekli kendini geliştiren stilist ve güzellik uzmanları." },
                  { title: "Modern Teknikler", desc: "En güncel saç ve güzellik teknikleriyle kaliteli hizmet." },
                  { title: "Müşteri Odaklı", desc: "Her müşteriye özel bakım ve kişiselleştirilmiş hizmet anlayışı." },
                ].map(({ title, desc }) => (
                  <div key={title} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: primary, flexShrink: 0, marginTop: 7 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{title}</div>
                      <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section id="contact" style={{ padding: "96px 24px", background: "#fafafa" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: primary, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>
              İletişim
            </p>
            <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.5px", color: "#111827" }}>
              Bize Ulaşın
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, maxWidth: 900, margin: "0 auto" }}>
            {salon.phone && (
              <a href={`tel:${salon.phone}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "white", borderRadius: 14, padding: "24px 28px", border: "1px solid #f3f4f6", transition: "box-shadow 0.15s, border-color 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLDivElement).style.borderColor = `${primary}40`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; (e.currentTarget as HTMLDivElement).style.borderColor = "#f3f4f6"; }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${primary}10`, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Telefon</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{salon.phone}</div>
                </div>
              </a>
            )}

            {salon.email && (
              <a href={`mailto:${salon.email}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "white", borderRadius: 14, padding: "24px 28px", border: "1px solid #f3f4f6", transition: "box-shadow 0.15s, border-color 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLDivElement).style.borderColor = `${primary}40`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; (e.currentTarget as HTMLDivElement).style.borderColor = "#f3f4f6"; }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${primary}10`, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>E-posta</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{salon.email}</div>
                </div>
              </a>
            )}

            {salon.address && (
              <div style={{ background: "white", borderRadius: 14, padding: "24px 28px", border: "1px solid #f3f4f6" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${primary}10`, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Adres</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", lineHeight: 1.5 }}>{salon.address}</div>
                {salon.googleMapsUrl && (
                  <a href={salon.googleMapsUrl} target="_blank" rel="noreferrer" style={{
                    display: "inline-block", marginTop: 10, fontSize: 13, color: primary, fontWeight: 600, textDecoration: "none",
                  }}>
                    Haritada gör →
                  </a>
                )}
              </div>
            )}

            {salon.whatsAppNumber && (
              <a href={`https://wa.me/${salon.whatsAppNumber}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <div style={{ background: "#f0fdf4", borderRadius: 14, padding: "24px 28px", border: "1px solid #bbf7d0", transition: "box-shadow 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#dcfce7", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#16a34a">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>WhatsApp</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Mesaj Gönder</div>
                </div>
              </a>
            )}
          </div>

          {(salon.instagramUrl || salon.facebookUrl) && (
            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 40 }}>
              {salon.instagramUrl && (
                <a href={salon.instagramUrl} target="_blank" rel="noreferrer" style={{
                  width: 44, height: 44, borderRadius: 10, background: "white",
                  border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center",
                  textDecoration: "none", transition: "border-color 0.15s",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = primary; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#e5e7eb"; }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#374151">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                </a>
              )}
              {salon.facebookUrl && (
                <a href={salon.facebookUrl} target="_blank" rel="noreferrer" style={{
                  width: 44, height: 44, borderRadius: 10, background: "white",
                  border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center",
                  textDecoration: "none", transition: "border-color 0.15s",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = primary; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#e5e7eb"; }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#374151">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      {salon.bookingEnabled && (
        <section style={{ padding: "80px 24px", background: primary }}>
          <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: onPrimary, letterSpacing: "-0.5px", marginBottom: 16 }}>
              Hemen Randevu Alın
            </h2>
            <p style={{ fontSize: 16, color: `${onPrimary}cc`, marginBottom: 32, lineHeight: 1.65 }}>
              Uzman stilistlerimizle tanışın. Online randevu sistemi 7/24 aktif.
            </p>
            <Link href={`/site/${slug}/book`} style={{
              display: "inline-block", padding: "14px 36px", borderRadius: 10,
              background: "white", color: primary,
              fontWeight: 700, fontSize: 15, textDecoration: "none",
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            }}>
              Randevu Al
            </Link>
          </div>
        </section>
      )}

      <footer style={{ background: "#111827", padding: "40px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#f9fafb", marginBottom: 4 }}>{salon.name}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>© {new Date().getFullYear()} Tüm hakları saklıdır.</div>
          </div>
          <div style={{ fontSize: 11, color: "#4b5563" }}>
            xCut ile güçlendirilmiştir
          </div>
        </div>
      </footer>
    </div>
  );
}
