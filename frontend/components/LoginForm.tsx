"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, setToken } from "@/lib/api";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  no_user:        "Bu Google hesabıyla kayıtlı bir kullanıcı bulunamadı.",
  trial_expired:  "Demo süreniz dolmuştur. Lütfen bizimle iletişime geçin.",
  exchange_failed:"Google ile kimlik doğrulama başarısız. Lütfen tekrar deneyin.",
  invalid_state:  "Güvenlik doğrulaması başarısız. Lütfen tekrar deneyin.",
  missing_params: "Google'dan eksik parametre döndü.",
  access_denied:  "Google ile giriş iptal edildi.",
};

export default function LoginForm() {
  const router = useRouter();
  const [mode,      setMode]      = useState<"user" | "tv">("user");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [mfaStep,     setMfaStep]     = useState(false);
  const [mfaToken,    setMfaToken]    = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpCode,     setOtpCode]     = useState("");
  const [forgotStep,  setForgotStep]  = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent,  setForgotSent]  = useState(false);

  // Handle Google OAuth callback (?session=... or ?google_error=...)
  useEffect(() => {
    const params      = new URLSearchParams(window.location.search);
    const sessionCode = params.get("session");
    const googleError = params.get("google_error");

    if (sessionCode) {
      setLoading(true);
      fetch(`${API_BASE_URL}/Auth/session/${sessionCode}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.accessToken) {
            setToken(data.accessToken);
            router.replace("/dashboard");
          } else {
            setError("Oturum kodu geçersiz. Lütfen tekrar giriş yapın.");
            window.history.replaceState({}, "", "/login");
            setLoading(false);
          }
        })
        .catch(() => {
          setError("Sunucuya bağlanılamadı.");
          setLoading(false);
        });
    } else if (googleError) {
      setError(GOOGLE_ERROR_MESSAGES[googleError] ?? "Google ile giriş başarısız oldu.");
      window.history.replaceState({}, "", "/login");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/Auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Giriş başarısız. Bilgilerinizi kontrol edin.");
        return;
      }
      if (data.requiresMfa) {
        setMfaToken(data.mfaSessionToken ?? "");
        setMaskedEmail(data.maskedEmail ?? "");
        setMfaStep(true);
        return;
      }
      setToken(data.accessToken);
      if (data.trialDaysLeft !== undefined) {
        localStorage.setItem("trialDaysLeft", String(data.trialDaysLeft));
      }
      router.replace("/dashboard");
    } catch {
      setError("Sunucuya bağlanılamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  const googleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/Auth/google-url`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Google ile giriş başlatılamadı.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Sunucuya bağlanılamadı.");
      setLoading(false);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/Auth/verify-mfa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfaSessionToken: mfaToken, code: otpCode.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Kod geçersiz veya süresi dolmuş.");
        return;
      }
      setToken(data.accessToken);
      if (data.trialDaysLeft !== undefined) {
        localStorage.setItem("trialDaysLeft", String(data.trialDaysLeft));
      }
      router.replace("/dashboard");
    } catch {
      setError("Sunucuya bağlanılamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await fetch(`${API_BASE_URL}/Auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      setForgotSent(true);
    } catch {
      setError("Sunucuya bağlanılamadı.");
    } finally {
      setLoading(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "13px 16px", borderRadius: 12,
    border: "1.5px solid #e4e7ec", fontSize: 15, outline: "none",
    background: "#fff", color: "#101828", minHeight: 50,
    transition: "border-color 0.15s, box-shadow 0.15s",
    WebkitAppearance: "none",
  };

  if (forgotStep) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <style>{`.xcut-inp:focus { border-color: #7c3aed !important; box-shadow: 0 0 0 3px #ede9fe !important; }`}</style>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>Şifremi Unuttum</div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
            {forgotSent ? "Bağlantı e-posta adresinize gönderildi." : "E-posta adresinizi girin, şifre sıfırlama bağlantısı göndereceğiz."}
          </div>
        </div>

        {forgotSent ? (
          <div style={{ padding: "16px", borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 14, color: "#166534", fontWeight: 600, marginBottom: 16, textAlign: "center" }}>
            ✅ Eğer bu e-posta kayıtlıysa sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.
          </div>
        ) : (
          <form onSubmit={submitForgot} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>E-posta</label>
              <input className="xcut-inp" type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                required placeholder="ornek@salon.com" style={inp} />
            </div>
            {error && (
              <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fef2f2", color: "#b42318", fontSize: 13, fontWeight: 600, border: "1px solid #fee4e2" }}>
                ⚠ {error}
              </div>
            )}
            <button type="submit" disabled={loading} style={{
              width: "100%", minHeight: 52, borderRadius: 12, border: "none",
              background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
            }}>
              {loading ? "Gönderiliyor..." : "Bağlantı Gönder"}
            </button>
          </form>
        )}

        <button type="button" onClick={() => { setForgotStep(false); setForgotSent(false); setForgotEmail(""); setError(""); }}
          style={{ background: "none", border: "none", color: "#64748b", fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0, textAlign: "center", marginTop: 12 }}>
          ← Giriş ekranına dön
        </button>
      </div>
    );
  }

  if (mfaStep) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <style>{`.xcut-inp:focus { border-color: #7c3aed !important; box-shadow: 0 0 0 3px #ede9fe !important; }`}</style>

        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>E-posta Doğrulama</div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
            <strong>{maskedEmail}</strong> adresine 6 haneli doğrulama kodu gönderdik.
          </div>
        </div>

        <form onSubmit={submitOtp} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>
              Doğrulama Kodu
            </label>
            <input
              className="xcut-inp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))}
              required
              placeholder="000000"
              autoComplete="one-time-code"
              autoFocus
              style={{ ...inp, textAlign: "center", letterSpacing: 8, fontFamily: "monospace", fontSize: 26, fontWeight: 800 }}
            />
          </div>

          {error && (
            <div style={{
              padding: "12px 16px", borderRadius: 10, background: "#fef2f2",
              color: "#b42318", fontSize: 13, fontWeight: 600,
              border: "1px solid #fee4e2",
            }}>
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || otpCode.length !== 6}
            style={{
              width: "100%", minHeight: 52, borderRadius: 12, border: "none",
              background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 16,
              cursor: (loading || otpCode.length !== 6) ? "not-allowed" : "pointer",
              opacity: (loading || otpCode.length !== 6) ? 0.6 : 1,
              marginTop: 4, letterSpacing: "-0.2px",
              transition: "background 0.15s, opacity 0.15s",
            }}
          >
            {loading ? "Doğrulanıyor..." : "Doğrula ve Giriş Yap"}
          </button>

          <button
            type="button"
            onClick={() => { setMfaStep(false); setOtpCode(""); setError(""); }}
            style={{
              background: "none", border: "none", color: "#64748b", fontSize: 13,
              cursor: "pointer", textDecoration: "underline", padding: 0, textAlign: "center",
            }}
          >
            ← Geri dön
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <style>{`
        .xcut-inp:focus {
          border-color: #7c3aed !important;
          box-shadow: 0 0 0 3px #ede9fe !important;
        }
        .xcut-google-btn:hover:not(:disabled) {
          border-color: #7c3aed !important;
          box-shadow: 0 2px 8px rgba(124,58,237,0.12) !important;
        }
      `}</style>

      {/* Mode Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "#f1f5f9", borderRadius: 12, padding: 4 }}>
        {([["user", "👤 Giriş Yap"], ["tv", "📺 TV Modu"]] as const).map(([m, lbl]) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(""); }}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              background: mode === m ? "#fff" : "transparent",
              color: mode === m ? "#0f172a" : "#64748b",
              boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,.08)" : "none",
              transition: "all 0.15s",
            }}
          >{lbl}</button>
        ))}
      </div>

      {mode === "tv" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "8px 0 16px" }}>
          <div style={{ fontSize: 56 }}>📺</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>TV / Kiosk Ekranı</div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
              TV ekranı açılır ve eşleştirme kodu gösterilir.<br />
              Kodu panelden girerek TVyi bağlayın.
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/kiosk/screen")}
            style={{
              width: "100%", minHeight: 52, borderRadius: 12, border: "none",
              background: "#0f172a", color: "#fff", fontWeight: 800, fontSize: 16,
              cursor: "pointer", letterSpacing: "-0.2px",
            }}
          >
            TV Ekranını Aç
          </button>
        </div>
      )}

      {mode === "user" && <form onSubmit={submitUser} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>
            E-posta
          </label>
          <input
            className="xcut-inp"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="ornek@salon.com"
            autoComplete="email"
            style={inp}
          />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>
            Şifre
          </label>
          <div style={{ position: "relative" }}>
            <input
              className="xcut-inp"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              style={{ ...inp, paddingRight: 48 }}
            />
            <button
              type="button"
              onClick={() => setShowPw(s => !s)}
              style={{
                position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "#94a3b8", fontSize: 18, padding: 4, lineHeight: 1,
              }}
              tabIndex={-1}
            >
              {showPw ? "🙈" : "👁"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={() => { setForgotStep(true); setForgotEmail(email); setError(""); }}
            style={{ background: "none", border: "none", color: "#7c3aed", fontSize: 12, cursor: "pointer", padding: 0, fontWeight: 600 }}>
            Şifremi Unuttum?
          </button>
        </div>

        {error && (
          <div style={{
            padding: "12px 16px", borderRadius: 10, background: "#fef2f2",
            color: "#b42318", fontSize: 13, fontWeight: 600,
            border: "1px solid #fee4e2",
          }}>
            ⚠ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%", minHeight: 52, borderRadius: 12, border: "none",
            background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 16,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            marginTop: 4, letterSpacing: "-0.2px",
            transition: "background 0.15s, opacity 0.15s",
          }}
        >
          {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: "#e4e7ec" }} />
          <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>veya</span>
          <div style={{ flex: 1, height: 1, background: "#e4e7ec" }} />
        </div>

        {/* Google Sign-In */}
        <button
          type="button"
          className="xcut-google-btn"
          onClick={googleSignIn}
          disabled={loading}
          style={{
            width: "100%", minHeight: 48, borderRadius: 12,
            border: "1.5px solid #e4e7ec", background: "#fff",
            color: "#101828", fontWeight: 700, fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google ile Giriş Yap
        </button>
      </form>}
    </div>
  );
}
