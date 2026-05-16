"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch, getToken, API_BASE_URL } from "@/lib/api";
import { useToast } from "@/components/Toast";

/* ── Types ────────────────────────────────────────────────────────────────── */
type KioskCode = {
  id: string; code: string; label?: string; isActive: boolean;
  expiresAtUtc?: string; createdAtUtc: string;
  displayLayout: string; playlistId?: string;
};
type Playlist = { id: string; name: string; slideCount: number; createdAtUtc: string };
type Slide = { id?: string; type: "image" | "video" | "youtube" | "html"; content: string; durationSeconds: number; title?: string };
type MediaItem = { id: string; originalName: string; fileUrl: string; mimeType: string; fileSizeBytes: number; uploadedAtUtc: string };

const LAYOUT_LABELS: Record<string, string> = {
  sidebar: "Sidebar (70/30)",
  overlay: "Alt Şerit (Tam ekran)",
};

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

/* ════════════════════════════════════════════════════════════════════════════ */
export default function KioskAdminPage() {
  const [tab, setTab] = useState<"codes" | "media" | "playlists">("codes");

  return (
    <AppShell title="Kiosk Yönetimi" description="TV ekranları ve playlist içeriklerini yönetin">
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid #f1f5f9", overflowX: "auto" }}>
        {([["codes", "📺 Kiosk Kodları"], ["playlists", "🎬 Playlist"], ["media", "🖼 Medya"]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "10px 18px", border: "none", background: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 14, whiteSpace: "nowrap",
            color: tab === k ? "#7c3aed" : "#64748b",
            borderBottom: tab === k ? "2px solid #7c3aed" : "2px solid transparent",
            marginBottom: -2, flexShrink: 0,
          }}>{lbl}</button>
        ))}
      </div>

      {tab === "codes"     && <CodesTab />}
      {tab === "playlists" && <PlaylistsTab />}
      {tab === "media"     && <MediaTab />}
    </AppShell>
  );
}

/* ── Codes Tab ───────────────────────────────────────────────────────────── */
function CodesTab() {
  const { toast, confirm } = useToast();
  const [codes,     setCodes]     = useState<KioskCode[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading,   setLoading]   = useState(true);

  // TV pairing
  const [pairCode,   setPairCode]   = useState("");
  const [pairLabel,  setPairLabel]  = useState("");
  const [pairLayout, setPairLayout] = useState("sidebar");
  const [pairPl,     setPairPl]     = useState("");
  const [pairing,    setPairing]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [cr, pr] = await Promise.all([apiFetch("/Kiosk/codes"), apiFetch("/Kiosk/playlists")]);
    if (cr.ok) setCodes(await cr.json());
    if (pr.ok) setPlaylists(await pr.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (id: string) => {
    await apiFetch(`/Kiosk/codes/${id}/toggle`, { method: "PATCH" });
    load();
  };

  const deleteCode = async (id: string, code: string) => {
    const ok = await confirm({ message: `"${code}" kodunu silmek istiyor musunuz?`, danger: true });
    if (!ok) return;
    await apiFetch(`/Kiosk/codes/${id}`, { method: "DELETE" });
    toast.success("Kod silindi.");
    load();
  };

  const updateSettings = async (id: string, field: "playlistId" | "displayLayout", value: string | null) => {
    const body: Record<string, unknown> = {};
    if (field === "playlistId") {
      if (value) body.playlistId = value;
      else body.clearPlaylist = true;
    } else {
      body.displayLayout = value;
    }
    await apiFetch(`/Kiosk/codes/${id}/settings`, { method: "PATCH", body: JSON.stringify(body) });
    load();
  };

  const acceptPairing = async () => {
    const code = pairCode.trim().toUpperCase();
    if (!code) { toast.error("TV eşleştirme kodu giriniz."); return; }
    setPairing(true);
    const body: Record<string, unknown> = { label: pairLabel || undefined, displayLayout: pairLayout };
    if (pairPl) body.playlistId = pairPl;
    const r = await apiFetch(`/Kiosk/pairing/${code}/accept`, { method: "POST", body: JSON.stringify(body) });
    setPairing(false);
    if (r.ok) {
      toast.success("TV başarıyla eşleştirildi.");
      setPairCode(""); setPairLabel(""); setPairPl("");
      load();
    } else {
      const d = await r.json().catch(() => ({}));
      toast.error(d.message ?? "Eşleştirme başarısız.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* TV Pairing */}
      <div className="card" style={{ padding: 20, border: "1.5px solid #ede9fe" }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4, color: "#7c3aed" }}>📺 TV Eşleştir</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14 }}>
          TV ekranında görünen eşleştirme kodunu girin
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Eşleştirme Kodu</label>
            <input
              value={pairCode}
              onChange={e => {
                const raw = e.target.value.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6);
                setPairCode(raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw);
              }}
              placeholder="ABC-123"
              maxLength={7}
              className="inp"
              style={{ width: 120, letterSpacing: 4, fontWeight: 800, fontSize: 16, textTransform: "uppercase" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Etiket (opsiyonel)</label>
            <input
              value={pairLabel} onChange={e => setPairLabel(e.target.value)}
              placeholder="Bekleme Salonu TV"
              className="inp" style={{ width: 180 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Ekran Düzeni</label>
            <select value={pairLayout} onChange={e => setPairLayout(e.target.value)} className="inp" style={{ width: 160 }}>
              {Object.entries(LAYOUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Playlist</label>
            <select value={pairPl} onChange={e => setPairPl(e.target.value)} className="inp" style={{ width: 180 }}>
              <option value="">Playlist Yok</option>
              {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button onClick={acceptPairing} disabled={pairing || !pairCode.trim()} className="btn btn-primary" style={{ minHeight: 40 }}>
            {pairing ? "Eşleştiriliyor..." : "Eşleştir"}
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
      ) : codes.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>Henüz kiosk kodu oluşturulmadı.</div>
      ) : (
        codes.map(c => (
          <div key={c.id} className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{
                fontSize: 20, fontWeight: 900, letterSpacing: 3,
                color: c.isActive ? "#7c3aed" : "#94a3b8",
                fontFamily: "monospace",
              }}>
                {c.code}
              </div>
              {c.label && <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{c.label}</span>}
              <span style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 700,
                background: c.isActive ? "#ede9fe" : "#f1f5f9",
                color: c.isActive ? "#7c3aed" : "#94a3b8",
              }}>
                {c.isActive ? "Aktif" : "Pasif"}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={() => toggle(c.id)} className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 12px" }}>
                  {c.isActive ? "Devre Dışı" : "Aktif Et"}
                </button>
                <button onClick={() => deleteCode(c.id, c.code)} className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 12px", color: "#dc2626" }}>
                  Sil
                </button>
              </div>
            </div>

            {/* Settings row */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", display: "block", marginBottom: 3 }}>Ekran Düzeni</label>
                <select
                  value={c.displayLayout}
                  onChange={e => updateSettings(c.id, "displayLayout", e.target.value)}
                  className="inp" style={{ fontSize: 12, minHeight: 34, padding: "5px 10px" }}
                >
                  {Object.entries(LAYOUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", display: "block", marginBottom: 3 }}>Playlist</label>
                <select
                  value={c.playlistId ?? ""}
                  onChange={e => updateSettings(c.id, "playlistId", e.target.value || null)}
                  className="inp" style={{ fontSize: 12, minHeight: 34, padding: "5px 10px" }}
                >
                  <option value="">Playlist Yok</option>
                  {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                Ekran URL:{" "}
                <a href={`/kiosk/screen?code=${c.code}`} target="_blank" style={{ color: "#7c3aed", fontWeight: 700 }}>
                  /kiosk/screen?code={c.code}
                </a>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ── Media Picker Modal ──────────────────────────────────────────────────── */
function MediaPickerModal({ onSelect, onClose }: { onSelect: (url: string, type: Slide["type"]) => void; onClose: () => void }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/Kiosk/media").then(async r => {
      if (r.ok) setMedia(await r.json());
      setLoading(false);
    });
  }, []);

  const pick = (m: MediaItem) => {
    const type: Slide["type"] = m.mimeType === "video/youtube" ? "youtube" : m.mimeType.startsWith("video/") ? "video" : "image";
    onSelect(m.fileUrl, type);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 16, padding: 20, width: "min(640px, 95vw)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Medya Seç</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        {loading ? (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: 32 }}>Yükleniyor...</div>
        ) : media.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: 32 }}>Medya kütüphanesi boş. Önce medya yükleyin.</div>
        ) : (
          <div style={{ overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {media.map(m => {
              const isYt = m.mimeType === "video/youtube";
              const isVid = !isYt && m.mimeType.startsWith("video/");
              const ytId = isYt ? (m.fileUrl.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1] ?? "") : "";
              return (
                <div
                  key={m.id}
                  onClick={() => pick(m)}
                  style={{ cursor: "pointer", borderRadius: 8, overflow: "hidden", border: "2px solid #e4e7ec", transition: "border-color 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#7c3aed")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#e4e7ec")}
                >
                  <div style={{ height: 90, background: "#f1f5f9", overflow: "hidden" }}>
                    {isYt ? (
                      <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                    ) : isVid ? (
                      <video src={m.fileUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
                    ) : (
                      <img src={m.fileUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                    )}
                  </div>
                  <div style={{ padding: "6px 8px", fontSize: 11, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.originalName}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Playlists Tab ───────────────────────────────────────────────────────── */
function PlaylistsTab() {
  const { toast, confirm } = useToast();
  const [playlists, setPlaylists]   = useState<Playlist[]>([]);
  const [selected,  setSelected]    = useState<string | null>(null);
  const [slides,    setSlides]      = useState<Slide[]>([]);
  const [newName,   setNewName]     = useState("");
  const [saving,    setSaving]      = useState(false);
  const [loading,   setLoading]     = useState(true);
  const [pickerIdx, setPickerIdx]   = useState<number | null>(null);

  const loadPlaylists = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch("/Kiosk/playlists");
    if (r.ok) setPlaylists(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadPlaylists(); }, [loadPlaylists]);

  const loadSlides = useCallback(async (id: string) => {
    const r = await apiFetch(`/Kiosk/playlists/${id}/slides`);
    if (r.ok) setSlides(await r.json());
  }, []);

  useEffect(() => { if (selected) loadSlides(selected); }, [selected, loadSlides]);

  const createPlaylist = async () => {
    if (!newName.trim()) return;
    const r = await apiFetch("/Kiosk/playlists", { method: "POST", body: JSON.stringify({ name: newName }) });
    if (r.ok) { toast.success("Playlist oluşturuldu."); setNewName(""); loadPlaylists(); }
  };

  const deletePlaylist = async (id: string, name: string) => {
    const ok = await confirm({ message: `"${name}" playlist'ini silmek istiyor musunuz?`, danger: true });
    if (!ok) return;
    await apiFetch(`/Kiosk/playlists/${id}`, { method: "DELETE" });
    toast.success("Playlist silindi.");
    if (selected === id) { setSelected(null); setSlides([]); }
    loadPlaylists();
  };

  const saveSlides = async () => {
    if (!selected) return;
    setSaving(true);
    const r = await apiFetch(`/Kiosk/playlists/${selected}/slides`, {
      method: "PUT",
      body: JSON.stringify(slides.map(s => ({
        type: s.type, content: s.content,
        durationSeconds: s.durationSeconds, title: s.title,
      }))),
    });
    if (r.ok) { toast.success("Playlist kaydedildi."); loadPlaylists(); }
    else toast.error("Kayıt başarısız.");
    setSaving(false);
  };

  const addSlide = (type: Slide["type"]) => {
    setSlides(prev => [...prev, { type, content: "", durationSeconds: type === "youtube" ? 3600 : 10 }]);
  };

  const updateSlide = (i: number, patch: Partial<Slide>) => {
    setSlides(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };

  const removeSlide = (i: number) => setSlides(prev => prev.filter((_, idx) => idx !== i));

  const moveSlide = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    setSlides(next);
  };

  const SLIDE_TYPE_LABELS: Record<string, string> = {
    image: "🖼 Görsel URL", video: "🎬 Video URL", youtube: "▶ YouTube URL", html: "📝 HTML İçerik"
  };

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      {/* Left: playlist list */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Playlistler</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createPlaylist()}
              placeholder="Playlist adı"
              className="inp" style={{ flex: 1, fontSize: 13 }}
            />
            <button onClick={createPlaylist} className="btn btn-primary" style={{ padding: "8px 12px", fontSize: 13 }}>+</button>
          </div>
          {loading ? (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>Yükleniyor...</div>
          ) : playlists.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>Playlist yok</div>
          ) : playlists.map(p => (
            <div
              key={p.id}
              onClick={() => setSelected(p.id)}
              style={{
                padding: "10px 12px", borderRadius: 8, marginBottom: 4, cursor: "pointer",
                background: selected === p.id ? "#ede9fe" : "#f8fafc",
                border: selected === p.id ? "1.5px solid #7c3aed" : "1.5px solid transparent",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: selected === p.id ? "#7c3aed" : "#1e293b" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.slideCount} slayt</div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deletePlaylist(p.id, p.name); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: "2px 4px" }}
              >×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Right: slide editor */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!selected ? (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
            Sol taraftan bir playlist seçin veya oluşturun
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Add slide buttons */}
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#64748b" }}>Slayt Ekle</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["image", "video", "youtube", "html"] as const).map(type => (
                  <button key={type} onClick={() => addSlide(type)} className="btn btn-ghost" style={{ fontSize: 12 }}>
                    + {SLIDE_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            {slides.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                Slayt ekleyerek playlist oluşturun
              </div>
            )}

            {slides.map((slide, i) => (
              <div key={i} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                    background: "#ede9fe", color: "#7c3aed",
                  }}>{SLIDE_TYPE_LABELS[slide.type]}</span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>#{i + 1}</span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                    <button onClick={() => moveSlide(i, -1)} disabled={i === 0} className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 12 }}>↑</button>
                    <button onClick={() => moveSlide(i, 1)} disabled={i === slides.length - 1} className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 12 }}>↓</button>
                    <button onClick={() => removeSlide(i)} className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 12, color: "#dc2626" }}>×</button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>
                      {slide.type === "html" ? "HTML İçerik" : "URL"}
                    </label>
                    {slide.type === "html" ? (
                      <textarea
                        value={slide.content}
                        onChange={e => updateSlide(i, { content: e.target.value })}
                        placeholder="<div style='color:white;font-size:40px;text-align:center'>Hoş Geldiniz</div>"
                        rows={4}
                        style={{
                          width: "100%", padding: "8px 12px", border: "1.5px solid #e4e7ec",
                          borderRadius: 8, fontSize: 12, fontFamily: "monospace",
                          resize: "vertical", boxSizing: "border-box",
                        }}
                      />
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          value={slide.content}
                          onChange={e => updateSlide(i, { content: e.target.value })}
                          placeholder={
                            slide.type === "youtube" ? "https://youtube.com/watch?v=..." :
                            slide.type === "video"   ? "https://... veya /uploads/kiosk/..." :
                            "https://... veya /uploads/kiosk/..."
                          }
                          className="inp" style={{ flex: 1, fontSize: 13 }}
                        />
                        <button
                          className="btn btn-ghost"
                          style={{ whiteSpace: "nowrap", fontSize: 12 }}
                          onClick={() => setPickerIdx(i)}
                        >📂 Medyadan Seç</button>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {slide.type !== "youtube" && (
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>
                        Süre (saniye)
                      </label>
                      <input
                        type="number" min={3} max={7200}
                        value={slide.durationSeconds}
                        onChange={e => updateSlide(i, { durationSeconds: Number(e.target.value) })}
                        className="inp" style={{ width: 100, fontSize: 13 }}
                      />
                      {slide.type === "video" && <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>Video bitince geçer</span>}
                    </div>
                    )}
                    {slide.type === "youtube" && (
                      <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center" }}>
                        ▶️ YouTube videosu döngüde oynar — playlist'te tek video varsa süresiz çalar
                      </div>
                    )}
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>
                        Başlık (opsiyonel)
                      </label>
                      <input
                        value={slide.title ?? ""}
                        onChange={e => updateSlide(i, { title: e.target.value || undefined })}
                        placeholder="Slayt başlığı"
                        className="inp" style={{ width: 200, fontSize: 13 }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {slides.length > 0 && (
              <button onClick={saveSlides} disabled={saving} className="btn btn-primary" style={{ alignSelf: "flex-start", minHeight: 42, paddingInline: 28 }}>
                {saving ? "Kaydediliyor..." : "💾 Playlist Kaydet"}
              </button>
            )}
          </div>
        )}
      </div>

      {pickerIdx !== null && (
        <MediaPickerModal
          onSelect={(url, type) => {
            updateSlide(pickerIdx, { content: url, type });
            setPickerIdx(null);
          }}
          onClose={() => setPickerIdx(null)}
        />
      )}
    </div>
  );
}

/* ── Media Tab ───────────────────────────────────────────────────────────── */
function MediaTab() {
  const { toast, confirm } = useToast();
  const [media,       setMedia]       = useState<MediaItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [uploading,   setUploading]   = useState(false);
  const [copied,      setCopied]      = useState<string | null>(null);
  const [urlInput,    setUrlInput]    = useState("");
  const [urlName,     setUrlName]     = useState("");
  const [urlType,     setUrlType]     = useState<"image" | "video" | "youtube">("image");
  const [addingUrl,   setAddingUrl]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch("/Kiosk/media");
    if (r.ok) setMedia(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const token = getToken();
      const r = await fetch(`${API_BASE_URL}/Kiosk/media/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.message ?? `"${file.name}" yüklenemedi.`);
      } else {
        toast.success(`"${file.name}" yüklendi.`);
      }
    }
    setUploading(false);
    load();
  };

  const deleteMedia = async (id: string, name: string) => {
    const ok = await confirm({ message: `"${name}" dosyasını silmek istiyor musunuz?`, danger: true });
    if (!ok) return;
    const r = await apiFetch(`/Kiosk/media/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Silindi."); load(); }
    else toast.error("Silinemedi.");
  };

  const addUrl = async () => {
    if (!urlInput.trim()) { toast.error("URL boş olamaz."); return; }
    setAddingUrl(true);
    const r = await apiFetch("/Kiosk/media/add-url", {
      method: "POST",
      body: JSON.stringify({ url: urlInput.trim(), mediaType: urlType, name: urlName.trim() || undefined }),
    });
    if (r.ok) {
      toast.success("Medya eklendi.");
      setUrlInput(""); setUrlName("");
      load();
    } else {
      const d = await r.json().catch(() => ({}));
      toast.error(d.message ?? "Eklenemedi.");
    }
    setAddingUrl(false);
  };

  const copyUrl = (url: string) => {
    const full = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    navigator.clipboard.writeText(full).then(() => {
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <div>
      <input
        ref={inputRef} type="file" multiple
        accept="image/*,video/mp4,video/webm"
        style={{ display: "none" }}
        onChange={e => upload(e.target.files)}
      />

      {/* Upload zone */}
      <div
        className="card"
        style={{
          padding: 32, textAlign: "center", marginBottom: 20, cursor: "pointer",
          border: "2px dashed #e4e7ec", borderRadius: 16,
          transition: "border-color 0.2s, background 0.2s",
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); upload(e.dataTransfer.files); }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>📤</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b", marginBottom: 4 }}>
          {uploading ? "Yükleniyor..." : "Dosya Yükle"}
        </div>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>
          JPG, PNG, GIF, WebP, MP4, WebM · Maks 100 MB
        </div>
        {!uploading && (
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>
            Dosya Seç
          </button>
        )}
      </div>

      {/* URL Ekle */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", marginBottom: 12 }}>🔗 URL ile Medya Ekle</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={urlType}
            onChange={e => setUrlType(e.target.value as "image" | "video" | "youtube")}
            style={{ padding: "8px 12px", border: "1px solid #e4e7ec", borderRadius: 8, fontSize: 13, background: "#fff" }}
          >
            <option value="image">Görsel</option>
            <option value="video">Video</option>
            <option value="youtube">YouTube</option>
          </select>
          <input
            type="text"
            placeholder="URL (https://...)"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            style={{ flex: 2, minWidth: 200, padding: "8px 12px", border: "1px solid #e4e7ec", borderRadius: 8, fontSize: 13 }}
          />
          <input
            type="text"
            placeholder="İsim (opsiyonel)"
            value={urlName}
            onChange={e => setUrlName(e.target.value)}
            style={{ flex: 1, minWidth: 140, padding: "8px 12px", border: "1px solid #e4e7ec", borderRadius: 8, fontSize: 13 }}
          />
          <button className="btn btn-primary" onClick={addUrl} disabled={addingUrl} style={{ whiteSpace: "nowrap" }}>
            {addingUrl ? "Ekleniyor..." : "Ekle"}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>Yükleniyor...</div>
      ) : media.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>Henüz medya yüklenmedi</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
          {media.map(m => {
            const isYoutube = m.mimeType === "video/youtube";
            const isVideo   = !isYoutube && m.mimeType.startsWith("video/");
            const ytId      = isYoutube ? (m.fileUrl.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1] ?? "") : "";
            return (
              <div key={m.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ height: 140, background: "#f8fafc", overflow: "hidden", position: "relative" }}>
                  {isYoutube ? (
                    <img
                      src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                      alt={m.originalName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : isVideo ? (
                    <video src={m.fileUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
                  ) : (
                    <img src={m.fileUrl} alt={m.originalName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  )}
                  <div style={{
                    position: "absolute", top: 6, right: 6,
                    background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 10, fontWeight: 700,
                    padding: "2px 6px", borderRadius: 4, backdropFilter: "blur(4px)",
                  }}>
                    {isYoutube ? "▶️ YouTube" : isVideo ? "🎬 Video" : "🖼 Görsel"}
                  </div>
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.originalName}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{m.fileSizeBytes > 0 ? fmtBytes(m.fileSizeBytes) : "Harici URL"}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button
                      onClick={() => copyUrl(m.fileUrl)}
                      className="btn btn-ghost"
                      style={{ flex: 1, fontSize: 11, padding: "5px 6px" }}
                    >
                      {copied === m.fileUrl ? "✓ Kopyalandı" : "URL Kopyala"}
                    </button>
                    <button
                      onClick={() => deleteMedia(m.id, m.originalName)}
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: "5px 8px", color: "#dc2626" }}
                    >×</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
