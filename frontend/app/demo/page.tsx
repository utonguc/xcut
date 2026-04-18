"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Result = {
  message: string;
  userName: string;
  tempPassword: string;
  trialEndsAt: string;
  loginUrl: string;
  email?: string;
};

export default function DemoPage() {
  const [form, setForm] = useState({
    salonName: "", fullName: "", email: "", phone: "", city: "",
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [result,  setResult]  = useState<Result | null>(null);

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/Demo/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Bir hata oluştu.");
      } else {
        setResult({ ...(data as Result), email: form.email });
      }
    } catch {
      setError("Sunucuya bağlanılamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e1130 60%, #2e1065 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "Inter, -apple-system, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 480 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <div style={{ fontWeight: 900, fontSize: 24, color: "#fff", letterSpacing: "-0.5px" }}>
              <span style={{ color: "#a78bfa" }}>x</span>Cut
            </div>
          </Link>
          <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
            30 gün ücretsiz · Kredi kartı gerekmez
          </div>
        </div>

        {result ? (
          /* ── Başarı ekranı ── */
          <div style={{
            background: "#fff", borderRadius: 20, padding: 32,
            boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
          }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 900 }}>Hesabınız hazır!</h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
                Demo süreniz <strong>{result.trialEndsAt}</strong> tarihine kadar geçerlidir.
              </p>
            </div>

            <div style={{
              background: "#f8fafc", borderRadius: 12, padding: 20,
              border: "1px solid #e2e8f0", marginBottom: 24,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Giriş Bilgileriniz
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  ["E-posta", result.email ?? ""],
                  ["Şifre",   result.tempPassword],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "#64748b" }}>{label}</span>
                    <span style={{
                      fontSize: 14, fontWeight: 800, fontFamily: "monospace",
                      background: "#fff", padding: "4px 12px", borderRadius: 8,
                      border: "1px solid #e2e8f0", color: "#0f172a",
                    }}>{val}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, padding: "8px 12px", background: "#fefce8", borderRadius: 8, border: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
                ⚠ Bu bilgileri kaydedin — e-posta bildirimi henüz aktif değil.
              </div>
            </div>

            <Link href="/login" style={{
              display: "block", textAlign: "center",
              padding: "14px", borderRadius: 12,
              background: "linear-gradient(135deg, #7c3aed, #a21caf)",
              color: "#fff", fontWeight: 800, fontSize: 15, textDecoration: "none",
            }}>
              Giriş Yap →
            </Link>
          </div>
        ) : (
          /* ── Kayıt formu ── */
          <div style={{
            background: "#fff", borderRadius: 20, padding: 32,
            boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
          }}>
            <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 900, color: "#0f172a" }}>
              Ücretsiz demo başlatın
            </h1>
            <p style={{ margin: "0 0 28px", color: "#64748b", fontSize: 14 }}>
              30 günlük deneme hesabı — tüm özellikler açık.
            </p>

            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Salon Adı *</label>
                <input
                  value={form.salonName}
                  onChange={e => f("salonName", e.target.value)}
                  placeholder="Örn: Ayşe Güzellik Salonu"
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Adınız Soyadınız *</label>
                <input
                  value={form.fullName}
                  onChange={e => f("fullName", e.target.value)}
                  placeholder="Örn: Ayşe Yılmaz"
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>E-posta *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => f("email", e.target.value)}
                  placeholder="salon@mail.com"
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Telefon *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => f("phone", e.target.value)}
                  placeholder="0532 000 00 00"
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Şehir</label>
                <input
                  value={form.city}
                  onChange={e => f("city", e.target.value)}
                  placeholder="İstanbul"
                  style={inputStyle}
                />
              </div>

              {error && (
                <div style={{
                  padding: "12px 14px", borderRadius: 10,
                  background: "#fef2f2", border: "1px solid #fecaca",
                  color: "#b42318", fontSize: 13, fontWeight: 600,
                }}>
                  ⚠ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "14px", borderRadius: 12, border: "none",
                  background: loading
                    ? "#c4b5fd"
                    : "linear-gradient(135deg, #7c3aed, #a21caf)",
                  color: "#fff", fontWeight: 800, fontSize: 15,
                  cursor: loading ? "not-allowed" : "pointer",
                  marginTop: 4,
                }}
              >
                {loading ? "Hesap oluşturuluyor..." : "Demo Hesabı Oluştur →"}
              </button>
            </form>

            <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "#94a3b8" }}>
              Zaten hesabınız var mı?{" "}
              <Link href="/login" style={{ color: "#7c3aed", fontWeight: 700, textDecoration: "none" }}>
                Giriş yapın
              </Link>
            </div>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 20 }}>
              {["🔒 SSL şifreli", "⚡ Anında erişim", "🚫 Kredi kartı yok"].map(t => (
                <span key={t} style={{ fontSize: 11, color: "#94a3b8" }}>{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", marginBottom: 6,
  fontSize: 13, fontWeight: 600, color: "#344054",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 10,
  border: "1px solid #d0d5dd", fontSize: 14,
  fontFamily: "inherit", boxSizing: "border-box",
  outline: "none", color: "#0f172a",
};
