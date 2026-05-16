"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token  = params.get("token") ?? "";

  const [newPw,    setNewPw]    = useState("");
  const [confirmPw,setConfirmPw]= useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState(false);

  useEffect(() => {
    if (!token) setError("Geçersiz veya eksik sıfırlama bağlantısı.");
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPw !== confirmPw) { setError("Şifreler eşleşmiyor."); return; }
    if (newPw.length < 6)    { setError("Şifre en az 6 karakter olmalı."); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/Auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: newPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message ?? "İşlem başarısız."); return; }
      setSuccess(true);
    } catch {
      setError("Sunucuya bağlanılamadı.");
    } finally {
      setLoading(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "13px 16px", borderRadius: 12,
    border: "1.5px solid #e4e7ec", fontSize: 15, outline: "none",
    background: "#fff", color: "#101828", boxSizing: "border-box",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)", padding: 24,
    }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "40px 36px", width: "min(440px,100%)", boxShadow: "0 8px 40px rgba(124,58,237,0.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🔑</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", marginBottom: 6 }}>Şifre Sıfırlama</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Yeni şifrenizi belirleyin.</div>
        </div>

        {success ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ padding: "16px", borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontWeight: 700, fontSize: 14, marginBottom: 20 }}>
              ✅ Şifreniz başarıyla sıfırlandı!
            </div>
            <button onClick={() => router.push("/login")} style={{
              width: "100%", minHeight: 50, borderRadius: 12, border: "none",
              background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer",
            }}>
              Giriş Yap →
            </button>
          </div>
        ) : !token ? (
          <div style={{ padding: "16px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fee4e2", color: "#b42318", fontWeight: 600, fontSize: 14 }}>
            ⚠ Geçersiz veya eksik sıfırlama bağlantısı.
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Yeni Şifre</label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)}
                  required placeholder="••••••••" style={{ ...inp, paddingRight: 48 }} autoFocus />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 18, padding: 4 }}
                  tabIndex={-1}>{showPw ? "🙈" : "👁"}</button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Şifre Tekrar</label>
              <input type={showPw ? "text" : "password"} value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                required placeholder="••••••••" style={inp} />
            </div>

            {error && (
              <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fef2f2", color: "#b42318", fontSize: 13, fontWeight: 600, border: "1px solid #fee4e2" }}>
                ⚠ {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: "100%", minHeight: 52, borderRadius: 12, border: "none",
              background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, marginTop: 4,
            }}>
              {loading ? "Sıfırlanıyor..." : "Şifremi Sıfırla"}
            </button>

            <button type="button" onClick={() => router.push("/login")}
              style={{ background: "none", border: "none", color: "#64748b", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
              ← Giriş ekranına dön
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
