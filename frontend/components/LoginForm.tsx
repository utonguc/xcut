"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, setToken } from "@/lib/api";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const submit = async (e: React.FormEvent) => {
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

  const inp: React.CSSProperties = {
    width: "100%", padding: "13px 16px", borderRadius: 12,
    border: "1.5px solid #e4e7ec", fontSize: 15, outline: "none",
    background: "#fff", color: "#101828", minHeight: 50,
    transition: "border-color 0.15s, box-shadow 0.15s",
    WebkitAppearance: "none",
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        .xcut-inp:focus {
          border-color: #7c3aed !important;
          box-shadow: 0 0 0 3px #ede9fe !important;
        }
      `}</style>

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
    </form>
  );
}
