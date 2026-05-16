"use client";

import { useEffect, useState } from "react";
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

type PublicService = {
  id: string;
  name: string;
  category?: string;
  durationMinutes?: number;
  price?: number;
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
  showPrices?: boolean;
  bookingEnabled?: boolean;
  stylists?: PublicStylist[];
  services?: PublicService[];
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

function formatDuration(min?: number) {
  if (!min) return "";
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
}

export default function PublicSalonPage({ slug }: { slug: string }) {
  const [salon,    setSalon]    = useState<PublicSalon | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch(`${API}/SalonWebsite/public/${slug}`)
      .then(r => { if (!r.ok) { setNotFound(true); return null; } return r.json(); })
      .then(d => {
        if (d) {
          setSalon({ ...d.website, stylists: d.stylists ?? [], services: d.services ?? [] });
        }
      })
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

  const primary   = salon.primaryColor ?? "#7c3aed";
  const onPrimary = isDark(primary) ? "#ffffff" : "#111827";
  const stylists  = salon.stylists ?? [];
  const services  = salon.services ?? [];

  const servicesByCategory = services.reduce<Record<string, PublicService[]>>((acc, s) => {
    const cat = s.category ?? "Diğer";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  const navLinks = [
    stylists.length > 0 && { href: "#stylists", label: "Stilistlerimiz" },
    services.length > 0 && { href: "#services", label: "Hizmetler" },
    salon.aboutText      && { href: "#about",    label: "Hakkımızda" },
    { href: "#contact", label: "İletişim" },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <div style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#111827", lineHeight: 1.6 }}>
      <GlobalStyles primary={primary} />

      <style>{`
        @media (max-width: 768px) {
          .pub-nav-links { display: none !important; }
          .pub-hamburger { display: flex !important; }
          .pub-about-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .pub-stats-grid { grid-template-columns: 1fr 1fr !important; }
          .pub-hero-btns { flex-direction: column; }
          .pub-contact-grid { grid-template-columns: 1fr !important; }
        }
        .pub-stylist-card:hover { box-shadow: 0 12px 40px rgba(0,0,0,0.08); transform: translateY(-3px); }
        .pub-service-row:hover { background: #faf5ff !important; }
        .pub-nav-link:hover { color: var(--primary) !important; }
      `}</style>

      {/* Header */}
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

          {/* Desktop nav */}
          <nav className="pub-nav-links" style={{ display: "flex", gap: 28, alignItems: "center" }}>
            {navLinks.map(l => (
              <a key={l.href} href={l.href} className="pub-nav-link" style={{ fontSize: 14, fontWeight: 500, color: "#374151", textDecoration: "none", transition: "color 0.15s" }}>
                {l.label}
              </a>
            ))}
            {salon.bookingEnabled && (
              <Link href={`/site/${slug}/book`} style={{
                padding: "9px 22px", borderRadius: 8, textDecoration: "none",
                background: primary, color: onPrimary,
                fontWeight: 600, fontSize: 14, letterSpacing: "-0.2px",
              }}>
                Randevu Al
              </Link>
            )}
          </nav>

          {/* Mobile hamburger */}
          <button
            className="pub-hamburger"
            onClick={() => setMenuOpen(v => !v)}
            style={{ display: "none", background: "none", border: "none", cursor: "pointer", padding: 8, flexDirection: "column", gap: 5 }}
          >
            {menuOpen
              ? <span style={{ fontSize: 22, color: "#374151", lineHeight: 1 }}>✕</span>
              : [0,1,2].map(i => <span key={i} style={{ display: "block", width: 22, height: 2, background: "#374151", borderRadius: 1 }} />)
            }
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {menuOpen && (
          <div style={{ background: "#fff", borderTop: "1px solid #f3f4f6", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            {navLinks.map(l => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                style={{ fontSize: 15, fontWeight: 600, color: "#374151", textDecoration: "none", padding: "4px 0" }}>
                {l.label}
              </a>
            ))}
            {salon.bookingEnabled && (
              <Link href={`/site/${slug}/book`} onClick={() => setMenuOpen(false)} style={{
                padding: "12px 0", borderRadius: 8, textDecoration: "none",
                background: primary, color: onPrimary,
                fontWeight: 700, fontSize: 14, textAlign: "center", marginTop: 4,
              }}>
                Randevu Al
              </Link>
            )}
          </div>
        )}
      </header>

      {/* Hero */}
      <section style={{
        position: "relative", minHeight: 580,
        display: "flex", alignItems: "center",
        background: salon.heroImageUrl
          ? `url(${salon.heroImageUrl}) center/cover no-repeat`
          : `linear-gradient(135deg, ${primary}15 0%, ${primary}05 100%)`,
        overflow: "hidden",
      }}>
        {salon.heroImageUrl && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.48)" }} />}
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
              fontSize: "clamp(28px, 5vw, 52px)", fontWeight: 800,
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

            <div className="pub-hero-btns" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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

      {/* Stats bar */}
      <div style={{ background: "white", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <div className="pub-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
            {[
              { value: stylists.length > 0 ? `${stylists.length}` : "Pro", label: "Uzman Stilist" },
              { value: services.length > 0 ? `${services.length}+` : "✓", label: "Hizmet Çeşidi" },
              { value: "Online", label: "Randevu Sistemi" },
              { value: "7/24", label: "Müşteri Desteği" },
            ].map(({ value, label }, i) => (
              <div key={i} style={{
                padding: "20px 16px", textAlign: "center",
                borderRight: i < 3 ? "1px solid #f3f4f6" : "none",
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: primary, letterSpacing: "-0.5px" }}>{value}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4, fontWeight: 500 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stilistler */}
      {stylists.length > 0 && (
        <section id="stylists" style={{ padding: "80px 24px", background: "#fafafa" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: primary, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>Ekibimiz</p>
              <h2 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 14, color: "#111827" }}>
                Uzman Stilistlerimiz
              </h2>
              <p style={{ fontSize: 16, color: "#6b7280", maxWidth: 440, margin: "0 auto" }}>
                Alanında deneyimli stilistlerimizle en iyi hizmeti sunuyoruz.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 24 }}>
              {stylists.map(s => {
                const photoSrc = s.photoUrl ? `${API.replace("/api", "")}${s.photoUrl}` : null;
                const specs = s.specializations?.split(",").map(x => x.trim()).filter(Boolean) ?? [];
                return (
                  <div key={s.id} className="pub-stylist-card" style={{
                    background: "white", borderRadius: 16,
                    border: "1px solid #f3f4f6", overflow: "hidden",
                    transition: "box-shadow 0.2s, transform 0.2s",
                  }}>
                    <div style={{ height: 200, background: `${primary}10`, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {photoSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoSrc} alt={s.fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <svg width="52" height="52" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={1} opacity={0.4}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>

                    <div style={{ padding: "18px 20px" }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 2, letterSpacing: "-0.3px" }}>{s.fullName}</h3>
                      {s.specialty && <p style={{ fontSize: 13, fontWeight: 600, color: primary, marginBottom: 10 }}>{s.specialty}</p>}

                      {s.avgRating !== null && s.avgRating !== undefined && salon.showReviews && (
                        <div style={{ marginBottom: 10 }}>
                          <Stars rating={s.avgRating} />
                          {s.reviewCount && s.reviewCount > 0 && (
                            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 4 }}>({s.reviewCount})</span>
                          )}
                        </div>
                      )}

                      {s.experienceYears && s.experienceYears > 0 && (
                        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{s.experienceYears} yıl deneyim</p>
                      )}

                      {specs.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
                          {specs.slice(0, 3).map(sp => (
                            <span key={sp} style={{ padding: "2px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${primary}0f`, color: primary, border: `1px solid ${primary}20` }}>{sp}</span>
                          ))}
                        </div>
                      )}

                      {s.biography && (
                        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.55, marginBottom: 14, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {s.biography}
                        </p>
                      )}

                      {salon.bookingEnabled && (
                        <Link href={`/site/${slug}/book?stylistId=${s.id}`} style={{
                          display: "block", padding: "9px 0", borderRadius: 8, textAlign: "center",
                          background: "transparent", border: `1.5px solid ${primary}`,
                          color: primary, fontWeight: 600, fontSize: 13, textDecoration: "none",
                          transition: "all 0.15s",
                        }}
                          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = primary; (e.currentTarget as HTMLAnchorElement).style.color = onPrimary; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = primary; }}
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

      {/* Hizmetler */}
      {services.length > 0 && (
        <section id="services" style={{ padding: "80px 24px", background: "white" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: primary, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>Hizmetlerimiz</p>
              <h2 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, letterSpacing: "-0.5px", color: "#111827" }}>
                Neler Sunuyoruz?
              </h2>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 32 }}>
              {Object.entries(servicesByCategory).map(([cat, items]) => (
                <div key={cat}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: primary, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 14, paddingBottom: 8, borderBottom: `2px solid ${primary}20` }}>
                    {cat}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {items.map(svc => (
                      <div key={svc.id} className="pub-service-row" style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 12px", borderRadius: 8,
                        transition: "background 0.15s",
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{svc.name}</div>
                          {svc.durationMinutes && (
                            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>{formatDuration(svc.durationMinutes)}</div>
                          )}
                        </div>
                        {salon.showPrices && svc.price && svc.price > 0 && (
                          <div style={{ fontSize: 15, fontWeight: 800, color: primary, flexShrink: 0, marginLeft: 12 }}>
                            {svc.price.toLocaleString("tr-TR")} ₺
                          </div>
                        )}
                        {salon.bookingEnabled && (
                          <Link href={`/site/${slug}/book`} style={{
                            marginLeft: 12, padding: "4px 12px", borderRadius: 6,
                            background: `${primary}10`, color: primary,
                            fontSize: 12, fontWeight: 700, textDecoration: "none", flexShrink: 0,
                          }}>
                            Al
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {salon.bookingEnabled && (
              <div style={{ textAlign: "center", marginTop: 40 }}>
                <Link href={`/site/${slug}/book`} style={{
                  display: "inline-block", padding: "13px 32px", borderRadius: 10,
                  background: primary, color: onPrimary,
                  fontWeight: 700, fontSize: 15, textDecoration: "none",
                }}>
                  Randevu Al
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Hakkımızda */}
      {salon.aboutText && (
        <section id="about" style={{ padding: "80px 24px", background: "#fafafa" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div className="pub-about-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: primary, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 16 }}>Hakkımızda</p>
                <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 20, lineHeight: 1.2, color: "#111827" }}>
                  {salon.name}
                </h2>
                <p style={{ fontSize: 16, color: "#4b5563", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                  {salon.aboutText}
                </p>
              </div>
              <div style={{ background: `${primary}07`, borderRadius: 20, padding: 40, border: `1px solid ${primary}15` }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {[
                    { title: "Uzman Kadro", desc: "Alanında deneyimli, sürekli kendini geliştiren stilist ve güzellik uzmanları." },
                    { title: "Modern Teknikler", desc: "En güncel saç ve güzellik teknikleriyle kaliteli hizmet." },
                    { title: "Müşteri Odaklı", desc: "Her müşteriye özel bakım ve kişiselleştirilmiş hizmet anlayışı." },
                  ].map(({ title, desc }) => (
                    <div key={title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${primary}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 14, color: primary }}>✓</span>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{title}</div>
                        <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      {salon.bookingEnabled && (
        <section style={{ padding: "72px 24px", background: primary }}>
          <div style={{ maxWidth: 580, margin: "0 auto", textAlign: "center" }}>
            <h2 style={{ fontSize: "clamp(22px,3vw,32px)", fontWeight: 800, color: onPrimary, letterSpacing: "-0.5px", marginBottom: 14 }}>
              Hemen Randevu Alın
            </h2>
            <p style={{ fontSize: 16, color: `${onPrimary}cc`, marginBottom: 28, lineHeight: 1.65 }}>
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

      {/* İletişim */}
      <section id="contact" style={{ padding: "80px 24px", background: "white" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: primary, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>İletişim</p>
            <h2 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, letterSpacing: "-0.5px", color: "#111827" }}>Bize Ulaşın</h2>
          </div>

          <div className="pub-contact-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, maxWidth: 900, margin: "0 auto" }}>
            {salon.phone && (
              <a href={`tel:${salon.phone}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "white", borderRadius: 14, padding: "22px 24px", border: "1px solid #f3f4f6", transition: "box-shadow 0.15s, border-color 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLDivElement).style.borderColor = `${primary}40`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; (e.currentTarget as HTMLDivElement).style.borderColor = "#f3f4f6"; }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: `${primary}10`, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>Telefon</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{salon.phone}</div>
                </div>
              </a>
            )}

            {salon.email && (
              <a href={`mailto:${salon.email}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "white", borderRadius: 14, padding: "22px 24px", border: "1px solid #f3f4f6", transition: "box-shadow 0.15s, border-color 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLDivElement).style.borderColor = `${primary}40`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; (e.currentTarget as HTMLDivElement).style.borderColor = "#f3f4f6"; }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: `${primary}10`, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>E-posta</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{salon.email}</div>
                </div>
              </a>
            )}

            {salon.address && (
              <div style={{ background: "white", borderRadius: 14, padding: "22px 24px", border: "1px solid #f3f4f6" }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: `${primary}10`, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>Adres</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", lineHeight: 1.5 }}>{salon.address}</div>
                {salon.googleMapsUrl && (
                  <a href={salon.googleMapsUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: 12, color: primary, fontWeight: 600, textDecoration: "none" }}>
                    Haritada gör →
                  </a>
                )}
              </div>
            )}

            {salon.whatsAppNumber && (
              <a href={`https://wa.me/${salon.whatsAppNumber}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <div style={{ background: "#f0fdf4", borderRadius: 14, padding: "22px 24px", border: "1px solid #bbf7d0", transition: "box-shadow 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: "#dcfce7", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="#16a34a"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                  </div>
                  <div style={{ fontSize: 10, color: "#16a34a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>WhatsApp</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Mesaj Gönder</div>
                </div>
              </a>
            )}
          </div>

          {(salon.instagramUrl || salon.facebookUrl) && (
            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 36 }}>
              {salon.instagramUrl && (
                <a href={salon.instagramUrl} target="_blank" rel="noreferrer" style={{ width: 42, height: 42, borderRadius: 10, background: "white", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = primary; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#e5e7eb"; }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="#374151"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
                </a>
              )}
              {salon.facebookUrl && (
                <a href={salon.facebookUrl} target="_blank" rel="noreferrer" style={{ width: 42, height: 42, borderRadius: 10, background: "white", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = primary; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#e5e7eb"; }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="#374151"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      <footer style={{ background: "#111827", padding: "36px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#f9fafb", marginBottom: 3 }}>{salon.name}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>© {new Date().getFullYear()} Tüm hakları saklıdır.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#4b5563" }}>
            <span>xCut ile güçlendirilmiştir</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
