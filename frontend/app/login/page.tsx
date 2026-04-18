"use client";

import LoginForm from "@/components/LoginForm";
import { APP_NAME, APP_VERSION, COMPANY_NAME } from "@/lib/version";

export default function LoginPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      background: "#fafafa",
    }}>
      <style>{`
        @media (max-width: 900px) {
          .login-brand { display: none !important; }
          .login-form-col { grid-column: 1 / -1 !important; }
        }
      `}</style>

      {/* Left: brand panel */}
      <div className="login-brand" style={{
        background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "48px 40px", position: "relative", overflow: "hidden",
      }}>
        {/* Background circles */}
        <div style={{ position: "absolute", top: -80, left: -80, width: 320, height: 320, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
        <div style={{ position: "absolute", bottom: -100, right: -60, width: 400, height: 400, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />

        {/* Logo / brand */}
        <div style={{ position: "relative", textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 64, marginBottom: 8 }}>✂️</div>
          <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-2px", marginBottom: 6 }}>
            {APP_NAME}
          </div>
          <div style={{ fontSize: 16, opacity: 0.75, fontWeight: 500, marginBottom: 40 }}>
            Salon Yönetim Platformu
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 340, textAlign: "left" }}>
            {[
              { icon: "📅", text: "Randevu ve takvim yönetimi" },
              { icon: "✂️", text: "Stilist ve hizmet takibi" },
              { icon: "👥", text: "Müşteri portföyü ve CRM" },
              { icon: "💰", text: "Fatura, finans ve stok" },
              { icon: "🌐", text: "Salon web sitesi builder" },
            ].map(f => (
              <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 22, width: 32, flexShrink: 0, textAlign: "center" }}>{f.icon}</span>
                <span style={{ fontSize: 14, opacity: 0.85, fontWeight: 500 }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: "absolute", bottom: 20, fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center" }}>
          {COMPANY_NAME} · v{APP_VERSION}
        </div>
      </div>

      {/* Right: form */}
      <div className="login-form-col" style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "48px 40px",
        background: "#fff",
      }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ marginBottom: 36 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "#101828", letterSpacing: "-0.8px", marginBottom: 8 }}>
              Hoş geldiniz 👋
            </h1>
            <p style={{ fontSize: 15, color: "#64748b" }}>
              Salonunuzu yönetmek için giriş yapın.
            </p>
          </div>
          <LoginForm />
          <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", marginTop: 28, lineHeight: 1.6 }}>
            Giriş yaparak <a href="#" style={{ color: "#7c3aed", textDecoration: "none" }}>Kullanım Koşulları</a>&apos;nı
            ve <a href="#" style={{ color: "#7c3aed", textDecoration: "none" }}>Gizlilik Politikası</a>&apos;nı kabul etmiş olursunuz.
          </p>
        </div>
      </div>
    </div>
  );
}
