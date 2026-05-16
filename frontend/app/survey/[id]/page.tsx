"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";

type SurveyQuestion = { id: string; sortOrder: number; text: string; type: string; options?: string; isRequired: boolean };
type SurveyDetail   = { id: string; title: string; description?: string; questions: SurveyQuestion[] };

export default function PublicSurveyPage() {
  const { id } = useParams<{ id: string }>();

  const [survey,    setSurvey]    = useState<SurveyDetail | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [answers,   setAnswers]   = useState<Record<string, string>>({});
  const [name,      setName]      = useState("");
  const [email,     setEmail]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE_URL}/Survey/${id}/public`)
      .then(r => r.ok ? r.json() : r.json().then((d: { message?: string }) => Promise.reject(d.message ?? "Anket bulunamadı.")))
      .then(setSurvey)
      .catch((msg: string) => setError(msg));
  }, [id]);

  const setAnswer = (questionId: string, value: string) =>
    setAnswers(prev => ({ ...prev, [questionId]: value }));

  const submit = async () => {
    if (!survey) return;

    const missing = survey.questions.filter(q => q.isRequired && !answers[q.id]?.trim());
    if (missing.length > 0) {
      alert(`Lütfen zorunlu soruları yanıtlayın: ${missing.map(q => q.text).join(", ")}`);
      return;
    }

    setSubmitting(true);
    const payload = {
      customerName: name.trim() || undefined,
      email: email.trim() || undefined,
      answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
    };

    const r = await fetch(`${API_BASE_URL}/Survey/${id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);
    if (r.ok) setSubmitted(true);
    else alert("Gönderme başarısız, lütfen tekrar deneyin.");
  };

  /* ── Loading ─────────────────────────────────────────────────────────── */
  if (!survey && !error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
      <div style={{ color: "#94a3b8", fontSize: 15 }}>Yükleniyor...</div>
    </div>
  );

  /* ── Error ───────────────────────────────────────────────────────────── */
  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <div style={{ fontWeight: 800, fontSize: 20, color: "#0f172a", marginBottom: 8 }}>Anket Bulunamadı</div>
        <div style={{ fontSize: 14, color: "#64748b" }}>{error}</div>
      </div>
    </div>
  );

  /* ── Thank you ───────────────────────────────────────────────────────── */
  if (submitted) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <div style={{ fontWeight: 900, fontSize: 24, color: "#0f172a", marginBottom: 12 }}>Teşekkürler!</div>
        <div style={{ fontSize: 15, color: "#64748b", maxWidth: 340, margin: "0 auto", lineHeight: 1.7 }}>
          Yanıtlarınız başarıyla kaydedildi. Geri bildiriminiz için teşekkür ederiz.
        </div>
      </div>
    </div>
  );

  /* ── Survey form ─────────────────────────────────────────────────────── */
  const inp: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: 10,
    border: "1px solid #e4e7ec", fontSize: 14, boxSizing: "border-box",
    fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "40px 16px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", borderRadius: 20, padding: "32px 32px 28px", color: "#fff", marginBottom: 24 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 900, fontSize: 22, marginBottom: survey?.description ? 10 : 0 }}>{survey!.title}</div>
          {survey?.description && <div style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.6 }}>{survey.description}</div>}
        </div>

        {/* Contact info (optional) */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", padding: "20px 24px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#344054", marginBottom: 12 }}>Bilgileriniz <span style={{ fontWeight: 400, color: "#94a3b8" }}>(isteğe bağlı)</span></div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Adınız" style={{ ...inp, flex: 1, minWidth: 160 }} />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="E-posta" type="email" style={{ ...inp, flex: 1, minWidth: 160 }} />
          </div>
        </div>

        {/* Questions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {survey!.questions.map((q, i) => (
            <div key={q.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #eaecf0", padding: "20px 24px" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ color: "#7c3aed", fontWeight: 800 }}>{i + 1}.</span>
                <span>{q.text}</span>
                {q.isRequired && <span style={{ color: "#dc2626", fontSize: 12, marginLeft: 2 }}>*</span>}
              </div>

              {/* Rating */}
              {q.type === "rating" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[1,2,3,4,5].map(n => {
                    const sel = Number(answers[q.id] ?? 0) >= n;
                    return (
                      <button key={n} onClick={() => setAnswer(q.id, String(n))} style={{
                        width: 48, height: 48, borderRadius: 12, border: "none", fontSize: 24,
                        background: sel ? "#fef3c7" : "#f8fafc",
                        cursor: "pointer", transition: "transform .1s",
                        transform: sel ? "scale(1.1)" : "scale(1)",
                      }}>★</button>
                    );
                  })}
                  {answers[q.id] && (
                    <div style={{ display: "flex", alignItems: "center", marginLeft: 8, fontSize: 14, color: "#64748b" }}>
                      {answers[q.id]}/5
                    </div>
                  )}
                </div>
              )}

              {/* Yes/No */}
              {q.type === "yesno" && (
                <div style={{ display: "flex", gap: 10 }}>
                  {["Evet", "Hayır"].map(v => (
                    <button key={v} onClick={() => setAnswer(q.id, v)} style={{
                      padding: "10px 28px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer",
                      border: `2px solid ${answers[q.id] === v ? "#7c3aed" : "#e4e7ec"}`,
                      background: answers[q.id] === v ? "#faf5ff" : "#fff",
                      color: answers[q.id] === v ? "#7c3aed" : "#344054",
                    }}>{v}</button>
                  ))}
                </div>
              )}

              {/* Choice */}
              {q.type === "choice" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(q.options ?? "").split(",").map(o => o.trim()).filter(Boolean).map(o => (
                    <button key={o} onClick={() => setAnswer(q.id, o)} style={{
                      padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left",
                      border: `2px solid ${answers[q.id] === o ? "#7c3aed" : "#e4e7ec"}`,
                      background: answers[q.id] === o ? "#faf5ff" : "#fff",
                      color: answers[q.id] === o ? "#7c3aed" : "#344054",
                    }}>{o}</button>
                  ))}
                </div>
              )}

              {/* Text */}
              {q.type === "text" && (
                <textarea value={answers[q.id] ?? ""} onChange={e => setAnswer(q.id, e.target.value)}
                  placeholder="Yanıtınızı buraya yazın..." rows={3}
                  style={{ ...inp, resize: "vertical" }} />
              )}
            </div>
          ))}
        </div>

        {/* Submit */}
        <div style={{ marginTop: 20 }}>
          <button onClick={submit} disabled={submitting} style={{
            width: "100%", padding: "14px 0", borderRadius: 14, border: "none",
            background: submitting ? "#e9d5ff" : "#7c3aed",
            color: submitting ? "#a78bfa" : "#fff",
            fontWeight: 800, fontSize: 16, cursor: submitting ? "not-allowed" : "pointer",
          }}>
            {submitting ? "Gönderiliyor..." : "Gönder"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "#94a3b8" }}>
          xCut · Kuaför Yönetim Sistemi
        </div>
      </div>
    </div>
  );
}
