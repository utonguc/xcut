"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { API_BASE_URL, getToken } from "@/lib/api";

type Appt = {
  id: string;
  customerName: string;
  stylistName?: string;
  serviceName?: string;
  startAtUtc: string;
  status: string;
};

type Slide = {
  id: string;
  type: "image" | "video" | "youtube" | "html";
  content: string;
  durationSeconds: number;
  title?: string;
};

type Playlist = { id: string; name: string; slides: Slide[] };

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function extractYoutubeId(url: string) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([^&?/]+)/);
  return m?.[1] ?? null;
}

function YouTubeSlide({ vid }: { vid: string }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [failed,   setFailed]   = useState(false);

  useEffect(() => {
    setVideoUrl(null);
    setFailed(false);
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res  = await fetch(`${API_BASE_URL}/Kiosk/youtube-url?v=${encodeURIComponent(vid)}`);
        if (!res.ok) { if (!cancelled) setFailed(true); return; }
        const data = await res.json();
        if (data.ready && data.url) { if (!cancelled) setVideoUrl(data.url); }
        else setTimeout(() => { if (!cancelled) poll(); }, 4000);
      } catch {
        if (!cancelled) setTimeout(poll, 5000);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [vid]);

  if (failed) return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0f1e", color: "#475569", fontSize: 14 }}>
      Video yüklenemedi
    </div>
  );

  if (!videoUrl) return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0a0f1e", gap: 14 }}>
      <div style={{ width: 36, height: 36, border: "3px solid #1e293b", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontSize: 13, color: "#64748b" }}>Video hazırlanıyor...</div>
    </div>
  );

  return (
    <video
      key={videoUrl}
      src={videoUrl}
      autoPlay muted playsInline loop
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}

function MediaPlayer({ slides, layout }: { slides: Slide[]; layout: string }) {
  const [idx, setIdx]         = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const advance = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setIdx(i => (i + 1) % slides.length);
      setVisible(true);
    }, 400);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length === 0) return;
    const slide = slides[idx];
    // videos managed by their own onEnded; others use duration timer
    if (slide.type !== "video") {
      timerRef.current = setTimeout(advance, slide.durationSeconds * 1000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [idx, slides, advance]);

  if (slides.length === 0) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
        flexDirection: "column", gap: 16,
      }}>
        <div style={{ fontSize: 64 }}>✂️</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#7c3aed", letterSpacing: 2 }}>xCut</div>
      </div>
    );
  }

  const slide = slides[idx];

  const containerStyle: React.CSSProperties = {
    flex: 1, position: "relative", overflow: "hidden", background: "#000",
    transition: "opacity 0.4s",
    opacity: visible ? 1 : 0,
  };

  return (
    <div style={containerStyle}>
      {slide.title && (
        <div style={{
          position: "absolute", bottom: 20, left: 20, zIndex: 10,
          background: "rgba(0,0,0,0.6)", color: "#fff",
          padding: "8px 16px", borderRadius: 8, fontSize: 16, fontWeight: 700,
          backdropFilter: "blur(4px)",
        }}>
          {slide.title}
        </div>
      )}

      {slide.type === "image" && (
        <img
          src={slide.content}
          alt={slide.title ?? ""}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}

      {slide.type === "video" && (
        <video
          key={slide.content}
          src={slide.content}
          autoPlay muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onEnded={advance}
        />
      )}

      {slide.type === "youtube" && (() => {
        const vid = extractYoutubeId(slide.content);
        return vid
          ? <YouTubeSlide key={vid} vid={vid} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0f1e", color: "#475569", fontSize: 14 }}>Geçersiz YouTube URL</div>;
      })()}

      {slide.type === "html" && (
        <div
          style={{
            width: "100%", height: "100%", overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
          }}
          dangerouslySetInnerHTML={{ __html: slide.content }}
        />
      )}

      {/* Slide dots */}
      {slides.length > 1 && (
        <div style={{
          position: "absolute", top: 12, right: 12, display: "flex", gap: 6, zIndex: 10,
        }}>
          {slides.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i === idx ? "#7c3aed" : "rgba(255,255,255,0.3)",
              cursor: "pointer", transition: "background 0.2s",
            }} onClick={() => { setIdx(i); setVisible(true); }} />
          ))}
        </div>
      )}
    </div>
  );
}

function QueuePanel({ appts, salonName, clock, dateStr, connected, layout }: {
  appts: Appt[]; salonName: string; clock: string; dateStr: string;
  connected: boolean; layout: string;
}) {
  const inProgress = appts.filter(a => a.status === "InProgress");
  const waiting    = appts.filter(a => a.status === "Scheduled" || a.status === "Late")
    .sort((a, b) => new Date(a.startAtUtc).getTime() - new Date(b.startAtUtc).getTime());
  const completed  = appts.filter(a => a.status === "Completed").slice(0, 3);

  if (layout === "overlay") {
    return (
      <div style={{
        background: "rgba(5,8,20,0.92)", backdropFilter: "blur(16px)",
        borderTop: "2px solid #1e293b", padding: "14px 28px",
        display: "flex", alignItems: "center", gap: 28, overflowX: "auto",
        flexShrink: 0,
      }}>
        <div style={{ flexShrink: 0, textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{clock}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{salonName}</div>
        </div>
        <div style={{ width: 1, height: 48, background: "#334155", flexShrink: 0 }} />
        {inProgress.map(a => (
          <div key={a.id} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 10, background: "#052e16", border: "1px solid #22c55e55" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#4ade80", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>✂️ İşlemde</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: "#f0fdf4" }}>{a.customerName}</div>
            {a.stylistName && <div style={{ fontSize: 12, color: "#86efac", marginTop: 1 }}>{a.stylistName}</div>}
          </div>
        ))}
        {waiting.slice(0, 6).map((a, i) => (
          <div key={a.id} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 10, background: "#0f172a", border: "1px solid #334155" }}>
            <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 700, marginBottom: 2 }}>#{i + 1} Bekliyor</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0" }}>{a.customerName}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{fmtTime(a.startAtUtc)}</div>
          </div>
        ))}
        <div style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "#22c55e" : "#dc2626", display: "inline-block" }} />
          <span style={{ fontSize: 12, color: connected ? "#22c55e" : "#dc2626", fontWeight: 600 }}>{connected ? "Canlı" : "Bağlanıyor"}</span>
        </div>
      </div>
    );
  }

  // sidebar layout
  return (
    <div style={{
      width: "32%", maxWidth: 380, background: "#060b18",
      borderLeft: "2px solid #1e293b", display: "flex", flexDirection: "column",
      overflow: "hidden", flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 22px", borderBottom: "2px solid #1e293b",
        background: "linear-gradient(135deg, #0f172a 0%, #1a1040 100%)",
      }}>
        <div style={{ fontSize: 13, color: "#a78bfa", fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
          ✂️ {salonName || "Salon"}
        </div>
        <div style={{ fontSize: 44, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {clock}
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4, fontWeight: 500 }}>{dateStr}</div>
        <div style={{ fontSize: 11, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#22c55e" : "#dc2626", display: "inline-block" }} />
          <span style={{ color: connected ? "#4ade80" : "#f87171", fontWeight: 600 }}>{connected ? "Canlı" : "Bağlanıyor..."}</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {inProgress.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 3, color: "#4ade80", marginBottom: 10 }}>
              🟢 İşlemde
            </div>
            {inProgress.map(a => (
              <div key={a.id} style={{
                background: "linear-gradient(135deg, #052e16, #0c2a1a)",
                border: "1.5px solid #22c55e44", borderRadius: 14, padding: "14px 16px", marginBottom: 8,
              }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#f0fdf4", lineHeight: 1.2 }}>{a.customerName}</div>
                {a.serviceName && <div style={{ fontSize: 13, color: "#86efac", marginTop: 4, fontWeight: 600 }}>{a.serviceName}</div>}
                {a.stylistName && <div style={{ fontSize: 13, color: "#4ade80", marginTop: 2 }}>👤 {a.stylistName}</div>}
              </div>
            ))}
          </div>
        )}

        {waiting.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 3, color: "#a78bfa", marginBottom: 10 }}>
              ⏳ Sırada Bekleyenler
            </div>
            {waiting.map((a, i) => (
              <div key={a.id} style={{
                background: "#0d1526", border: "1.5px solid #1e293b", borderRadius: 12,
                padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: i === 0 ? "#312e81" : "#1e1b4b",
                  border: i === 0 ? "2px solid #818cf8" : "1.5px solid #312e81",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 900, color: i === 0 ? "#c7d2fe" : "#a78bfa", flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.customerName}
                  </div>
                  {a.serviceName && (
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.serviceName}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{fmtTime(a.startAtUtc)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {appts.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✂️</div>
            <div style={{ color: "#1e293b", fontSize: 14, fontWeight: 600 }}>Bugün randevu yok</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KioskScreenPage() {
  const [appts,         setAppts]         = useState<Appt[]>([]);
  const [playlist,      setPlaylist]       = useState<Playlist | null>(null);
  const [salonName,     setSalonName]      = useState("");
  const [displayLayout, setDisplayLayout]  = useState("sidebar");
  const [clock,         setClock]          = useState("");
  const [dateStr,       setDateStr]        = useState("");
  const [connected,     setConnected]      = useState(false);
  const [error,         setError]          = useState("");
  const [authed,        setAuthed]         = useState(false);

  // TV pairing state
  const [pairingCode,    setPairingCode]    = useState("");
  const [pairingExpiry,  setPairingExpiry]  = useState<Date | null>(null);
  const [secondsLeft,    setSecondsLeft]    = useState(0);
  const [pairingLoading, setPairingLoading] = useState(false);

  const esRef      = useRef<EventSource | null>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeToken = useCallback(() =>
    localStorage.getItem("kiosk_token") ?? getToken() ?? "", []);

  const fetchQueue = useCallback(async () => {
    const token = activeToken();
    if (!token) { setAuthed(false); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/Kiosk/queue`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem("kiosk_token");
        if (!getToken()) { setAuthed(false); }
        return;
      }
      if (!res.ok) { setError("Veri alınamadı."); return; }
      const data = await res.json();
      setAppts(data.appointments ?? []);
      setSalonName(data.salonName ?? localStorage.getItem("kiosk_salon") ?? "");
      if (data.playlist) setPlaylist(data.playlist);
      setError("");
    } catch { setError("Sunucuya bağlanılamadı."); }
  }, [activeToken]);

  const initPairing = useCallback(async () => {
    setPairingLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/Kiosk/pairing/init`, { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();
      setPairingCode(data.code);
      const expiry = new Date(data.expiresAtUtc);
      setPairingExpiry(expiry);
      setSecondsLeft(Math.max(0, Math.round((expiry.getTime() - Date.now()) / 1000)));
    } finally {
      setPairingLoading(false);
    }
  }, []);

  const acceptPairing = useCallback((token: string, salon: string, layout: string) => {
    localStorage.setItem("kiosk_token",  token);
    localStorage.setItem("kiosk_salon",  salon);
    localStorage.setItem("kiosk_layout", layout);
    setSalonName(salon);
    setDisplayLayout(layout);
    if (pollRef.current)  clearInterval(pollRef.current);
    if (countRef.current) clearInterval(countRef.current);
    setAuthed(true);
  }, []);

  // Clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
      setDateStr(now.toLocaleDateString("tr-TR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Init: admin token > stored kiosk token > pairing mode
  useEffect(() => {
    if (getToken()) { setAuthed(true); return; }
    const kioskToken = localStorage.getItem("kiosk_token");
    if (kioskToken) {
      setDisplayLayout(localStorage.getItem("kiosk_layout") ?? "sidebar");
      setSalonName(localStorage.getItem("kiosk_salon") ?? "");
      setAuthed(true);
      return;
    }
    initPairing();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling for pairing acceptance
  useEffect(() => {
    if (authed || !pairingCode) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/Kiosk/pairing/${pairingCode}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.accepted) {
          acceptPairing(data.token, data.salonName ?? "", data.displayLayout ?? "sidebar");
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [authed, pairingCode, acceptPairing]);

  // Countdown + auto-renew
  useEffect(() => {
    if (authed || !pairingExpiry) return;
    if (countRef.current) clearInterval(countRef.current);
    countRef.current = setInterval(() => {
      const left = Math.max(0, Math.round((pairingExpiry.getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(countRef.current!);
        initPairing();
      }
    }, 1000);
    return () => { if (countRef.current) clearInterval(countRef.current); };
  }, [authed, pairingExpiry, initPairing]);

  // SSE + polling when authed
  useEffect(() => {
    if (!authed) return;
    const token = activeToken();
    if (!token) { setAuthed(false); return; }

    fetchQueue();

    const connect = () => {
      const es = new EventSource(`${API_BASE_URL}/Kiosk/events?token=${encodeURIComponent(token)}`);
      esRef.current = es;
      es.addEventListener("connected", () => setConnected(true));
      es.addEventListener("queue_update", (e: MessageEvent) => {
        try {
          const updated = JSON.parse(e.data) as Appt;
          setAppts(prev => {
            const idx = prev.findIndex(a => a.id === updated.id);
            if (idx === -1) return prev;
            const next = [...prev]; next[idx] = { ...next[idx], ...updated }; return next;
          });
        } catch { /* ignore */ }
      });
      es.onerror = () => {
        setConnected(false);
        es.close();
        setTimeout(connect, 3000);
      };
    };
    connect();
    return () => { esRef.current?.close(); };
  }, [authed, fetchQueue, activeToken]);

  // Pairing screen
  if (!authed) {
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
    const ss = String(secondsLeft % 60).padStart(2, "0");
    return (
      <div style={{
        minHeight: "100vh", background: "#0a0f1e", display: "flex",
        alignItems: "center", justifyContent: "center",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>✂️</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#f1f5f9", marginBottom: 8, letterSpacing: 1 }}>
            xCut Kiosk
          </div>
          <div style={{ fontSize: 14, color: "#64748b", marginBottom: 48 }}>
            Bu kodu panelden girerek ekranı eşleştirin
          </div>

          {pairingLoading ? (
            <div style={{
              width: 56, height: 56, border: "4px solid #1e293b",
              borderTopColor: "#7c3aed", borderRadius: "50%",
              animation: "spin 0.8s linear infinite", margin: "0 auto",
            }} />
          ) : (
            <>
              <div style={{
                display: "inline-block",
                background: "#111827",
                border: "2px solid #7c3aed",
                borderRadius: 20,
                padding: "28px 56px",
                marginBottom: 32,
              }}>
                <div style={{
                  fontSize: 72, fontWeight: 900, color: "#a78bfa",
                  letterSpacing: 14, fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                }}>
                  {pairingCode}
                </div>
              </div>

              <div style={{ fontSize: 14, color: "#475569" }}>
                Kodun geçerlilik süresi:{" "}
                <span style={{ color: secondsLeft < 60 ? "#f87171" : "#7c3aed", fontWeight: 700 }}>
                  {mm}:{ss}
                </span>
              </div>

              <button
                onClick={initPairing}
                style={{
                  marginTop: 24, padding: "10px 28px", borderRadius: 10, border: "1px solid #1e293b",
                  background: "transparent", color: "#64748b", fontSize: 13, cursor: "pointer",
                }}
              >
                Yeni kod üret
              </button>
            </>
          )}
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const slides = playlist?.slides ?? [];

  return (
    <div style={{
      width: "100vw", height: "100vh", background: "#0a0f1e",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      display: "flex",
      flexDirection: displayLayout === "overlay" ? "column" : "row",
      overflow: "hidden",
    }}>
      {error && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 50,
          padding: "10px 24px", background: "#450a0a", color: "#fca5a5", fontSize: 13, textAlign: "center",
        }}>
          ⚠ {error}
        </div>
      )}

      <MediaPlayer slides={slides} layout={displayLayout} />

      <QueuePanel
        appts={appts} salonName={salonName} clock={clock} dateStr={dateStr}
        connected={connected} layout={displayLayout}
      />
    </div>
  );
}
