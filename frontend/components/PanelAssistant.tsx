"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X, Send, Bot, ChevronDown } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const PAGE_LABELS: Record<string, string> = {
  "/dashboard":    "Dashboard",
  "/appointments": "Randevular",
  "/takvim":       "Takvim",
  "/customers":    "Müşteriler",
  "/stylists":     "Stilistler",
  "/personel":     "Personel",
  "/services":     "Hizmetler",
  "/stock":        "Stok",
  "/kasa":         "Kasa",
  "/finance":      "Finans",
  "/raporlar":     "Raporlar",
  "/tasks":        "Görevler",
  "/website":      "Web Sitesi",
  "/crm":          "CRM",
  "/ayarlar":      "Ayarlar",
  "/bekleme":      "Bekleme Listesi",
  "/denetim":      "Denetim Logu",
  "/sira":         "Sıra",
};

const PAGE_SUGGESTIONS: Record<string, string[]> = {
  "/dashboard":    ["Widget nasıl eklerim?", "Dashboard'u nasıl özelleştiririm?", "Gelir widget'ı neden 0 gösteriyor?"],
  "/appointments": ["Yeni randevu nasıl eklerim?", "Randevu talebini nasıl onaylarım?", "İptal edilen randevuyu müşteri görür mü?"],
  "/takvim":       ["Belirli stalistin takvimini nasıl görürüm?", "Takvimden randevu oluşturabilir miyim?"],
  "/customers":    ["Yeni müşteri nasıl eklenir?", "Müşteri VIP nasıl yapılır?", "Müşteri mail geçmişini görebilir miyim?"],
  "/crm":          ["Toplu mail nasıl gönderilir?", "Mail şablonunda {{ad}} nasıl kullanılır?", "SMS ne zaman gelecek?"],
  "/website":      ["Web sitemi nasıl yayınlarım?", "Online randevu formunu nasıl açarım?", "AI ile içerik nasıl oluştururum?"],
  "/kasa":         ["Ödeme sonrası makbuz nasıl gönderilir?", "Kasa nasıl kapatılır?", "İndirim nasıl uygulanır?"],
  "/ayarlar":      ["Google Takvim nasıl bağlanır?", "Bildirim maillerini nasıl açarım/kapatırım?", "Kiosk kodu nerede?"],
  "/finance":      ["Fatura nasıl oluştururum?", "Gider kategorisi nasıl eklenir?"],
  "/stock":        ["Kritik stok seviyesi nasıl ayarlanır?", "Stok hareketi nasıl kaydedilir?"],
  "/personel":     ["Yeni personel nasıl eklenir?", "Rol farkları nedir?", "Şifre nasıl sıfırlanır?"],
  "/raporlar":     ["Stilist performans raporu nasıl alınım?", "Raporu PDF olarak indirebilir miyim?"],
};

const DEFAULT_SUGGESTIONS = ["Hangi özellikler var?", "Toplu mail nasıl gönderilir?", "Randevu hatırlatmaları otomatik mi?"];

function renderMd(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

export default function PanelAssistant() {
  const pathname  = usePathname();
  const [open,    setOpen]    = useState(false);
  const [msgs,    setMsgs]    = useState<Msg[]>([]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [unread,  setUnread]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const pageLabel   = PAGE_LABELS[pathname] ?? "";
  const suggestions = PAGE_SUGGESTIONS[pathname] ?? DEFAULT_SUGGESTIONS;

  const welcomeMsg: Msg = {
    role: "assistant",
    content: pageLabel
      ? `Merhaba! **${pageLabel}** sayfasındasınız. Bu sayfayla ilgili ya da xCut hakkında her konuda yardımcı olabilirim. ✨`
      : "Merhaba! xCut kullanımı hakkında sorularınızı yanıtlamaktan memnuniyet duyarım. ✨",
  };

  useEffect(() => {
    if (open && msgs.length === 0) setMsgs([welcomeMsg]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset welcome message when page changes
  useEffect(() => {
    if (msgs.length === 1 && msgs[0].role === "assistant") {
      setMsgs([welcomeMsg]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");

    const userMsg: Msg = { role: "user", content };
    const next = [...msgs, userMsg];
    setMsgs(next);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
          context: { page: pathname },
        }),
      });

      const data = await res.json();
      const reply = data.reply ?? "Üzgünüm, bir hata oluştu.";
      setMsgs(prev => [...prev, { role: "assistant", content: reply }]);
      if (!open) setUnread(true);
    } catch {
      setMsgs(prev => [...prev, { role: "assistant", content: "Bağlantı hatası. Lütfen tekrar deneyin." }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const toggle = () => {
    setOpen(o => !o);
    setUnread(false);
  };

  return (
    <>
      <style>{`
        .xai-panel {
          animation: xai-slide-up 0.22s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes xai-slide-up {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .xai-msg-in {
          animation: xai-msg 0.18s ease-out;
        }
        @keyframes xai-msg {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .xai-fab:hover { transform: scale(1.08); }
        .xai-fab { transition: transform 0.15s, box-shadow 0.15s; }
        .xai-send:hover:not(:disabled) { background: #6d28d9 !important; }
        .xai-suggest:hover { background: #ede9fe !important; border-color: #7c3aed !important; color: #6d28d9 !important; }
        @media (max-width: 900px) {
          .xai-fab-pos   { bottom: 80px !important; }
          .xai-panel-pos { bottom: 144px !important; width: calc(100vw - 32px) !important; right: 16px !important; }
        }
      `}</style>

      {/* Floating button */}
      <button
        className="xai-fab xai-fab-pos"
        onClick={toggle}
        title="xCut Asistan"
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 999,
          width: 52, height: 52, borderRadius: "50%", border: "none",
          background: open ? "#1e1b4b" : "linear-gradient(135deg, #7c3aed, #a21caf)",
          color: "#fff", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(124,58,237,0.45)",
        }}
      >
        {open
          ? <ChevronDown size={20} />
          : <>
              <Sparkles size={20} />
              {unread && (
                <span style={{
                  position: "absolute", top: 4, right: 4,
                  width: 10, height: 10, borderRadius: "50%",
                  background: "#f43f5e", border: "2px solid #fff",
                }} />
              )}
            </>
        }
      </button>

      {/* Chat panel */}
      {open && (
        <div className="xai-panel xai-panel-pos" style={{
          position: "fixed", bottom: 86, right: 24, zIndex: 998,
          width: 340, maxHeight: "70vh",
          background: "#fff", borderRadius: 20,
          border: "1px solid #e4e7ec",
          boxShadow: "0 8px 40px rgba(0,0,0,0.14)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg, #1e1b4b, #2e1065)",
            padding: "14px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(167,139,250,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Bot size={16} color="#c4b5fd" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>xCut Asistan</div>
                {pageLabel && (
                  <div style={{ fontSize: 11, color: "#a78bfa", marginTop: 1 }}>{pageLabel} sayfasında</div>
                )}
              </div>
            </div>
            <button onClick={toggle} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4, borderRadius: 6, display: "flex" }}>
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 8px", display: "flex", flexDirection: "column", gap: 10, minHeight: 200, maxHeight: 340 }}>
            {msgs.map((m, i) => (
              <div key={i} className="xai-msg-in" style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "85%", padding: "9px 13px", borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: m.role === "user" ? "linear-gradient(135deg, #7c3aed, #6d28d9)" : "#f8fafc",
                  color: m.role === "user" ? "#fff" : "#1e293b",
                  fontSize: 13, lineHeight: 1.6,
                  border: m.role === "assistant" ? "1px solid #f1f5f9" : "none",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
                  dangerouslySetInnerHTML={{ __html: renderMd(m.content) }}
                />
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: "14px 14px 14px 4px", border: "1px solid #f1f5f9", display: "flex", gap: 4, alignItems: "center" }}>
                  {[0,1,2].map(i => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: "50%", background: "#a78bfa",
                      display: "inline-block",
                      animation: "xai-dot 1.2s infinite",
                      animationDelay: `${i * 0.2}s`,
                    }} />
                  ))}
                  <style>{`@keyframes xai-dot { 0%,80%,100% { transform:scale(0.7); opacity:0.4; } 40% { transform:scale(1); opacity:1; } }`}</style>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions — only show when only welcome message */}
          {msgs.length <= 1 && !loading && (
            <div style={{ padding: "0 14px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
              {suggestions.map(s => (
                <button
                  key={s}
                  className="xai-suggest"
                  onClick={() => send(s)}
                  style={{
                    textAlign: "left", padding: "7px 11px", borderRadius: 9,
                    background: "#faf5ff", border: "1px solid #e9d5ff",
                    color: "#7c3aed", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8, alignItems: "flex-end", background: "#fafafa" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Bir şey sorun…"
              rows={1}
              style={{
                flex: 1, resize: "none", border: "1.5px solid #e4e7ec", borderRadius: 10,
                padding: "8px 12px", fontSize: 13, outline: "none",
                background: "#fff", color: "#1e293b", lineHeight: 1.5,
                maxHeight: 80, overflow: "auto",
                fontFamily: "inherit",
              }}
              onFocus={e => (e.target.style.borderColor = "#7c3aed")}
              onBlur={e => (e.target.style.borderColor = "#e4e7ec")}
            />
            <button
              className="xai-send"
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{
                width: 36, height: 36, borderRadius: 10, border: "none",
                background: input.trim() && !loading ? "#7c3aed" : "#e2e8f0",
                color: input.trim() && !loading ? "#fff" : "#94a3b8",
                cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "all 0.15s",
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
