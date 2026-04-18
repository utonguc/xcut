"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type SearchResult = {
  id: string;
  type: "customer" | "stylist" | "appointment" | "task";
  title: string;
  subtitle?: string;
  href: string;
};

const TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  customer:    { icon: "👤", label: "Müşteri",  color: "#7c3aed" },
  stylist:     { icon: "✂️", label: "Stilist",  color: "#0ea5e9" },
  appointment: { icon: "📅", label: "Randevu",  color: "#f59e0b" },
  task:        { icon: "✓",  label: "Görev",    color: "#22c55e" },
};

const QUICK_LINKS = [
  { icon: "👥", label: "Müşteriler",  href: "/customers" },
  { icon: "📅", label: "Randevular",  href: "/appointments" },
  { icon: "✓",  label: "Görevler",   href: "/tasks" },
  { icon: "📊", label: "Dashboard",  href: "/dashboard" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function GlobalSearch({ open, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [cursor, setCursor]     = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setCursor(0);
    }
  }, [open]);

  const search = useCallback((q: string) => {
    clearTimeout(debounce.current);
    if (!q.trim()) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/Search?q=${encodeURIComponent(q)}&limit=4`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } finally {
        setLoading(false);
      }
    }, 220);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = query ? results : QUICK_LINKS;
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, items.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (query && results[cursor]) {
        router.push(results[cursor].href);
        onClose();
      } else if (!query && QUICK_LINKS[cursor]) {
        router.push(QUICK_LINKS[cursor].href);
        onClose();
      }
    }
    if (e.key === "Escape") onClose();
  };

  if (!open) return null;

  const displayItems = query ? results : null;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 300, backdropFilter: "blur(4px)" }}
      />
      <div style={{
        position: "fixed", top: "16vh", left: "50%", transform: "translateX(-50%)",
        width: "min(600px, 94vw)", zIndex: 301,
        background: "var(--surface,#fff)", borderRadius: 18,
        boxShadow: "0 24px 80px rgba(15,23,42,0.22)",
        border: "1px solid var(--border,#eaecf0)",
        overflow: "hidden",
      }}>
        {/* Search input */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); search(e.target.value); setCursor(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Müşteri, stilist, randevu ara..."
            style={{
              flex: 1, border: "none", outline: "none", fontSize: 16,
              background: "transparent", color: "var(--text,#101828)",
            }}
          />
          {loading && (
            <div style={{ width: 18, height: 18, border: "2px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.6s linear infinite", flexShrink: 0 }} />
          )}
          <kbd style={{ padding: "3px 8px", borderRadius: 6, fontSize: 12, fontFamily: "monospace", background: "var(--surface-2,#f8fafc)", border: "1px solid var(--border,#e4e7ec)", color: "#94a3b8", flexShrink: 0 }}>ESC</kbd>
        </div>

        {/* Results / quick links */}
        <div style={{ maxHeight: 400, overflowY: "auto", padding: "8px 0" }}>
          {!query && (
            <>
              <div style={{ padding: "6px 20px 4px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                Hızlı Erişim
              </div>
              {QUICK_LINKS.map((link, i) => (
                <button
                  key={link.href}
                  onClick={() => { router.push(link.href); onClose(); }}
                  style={{
                    width: "100%", padding: "10px 20px",
                    display: "flex", alignItems: "center", gap: 12,
                    background: cursor === i ? "var(--primary-light,#ede9fe)" : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    color: "var(--text,#101828)",
                  }}
                  onMouseEnter={() => setCursor(i)}
                >
                  <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{link.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{link.label}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>→</span>
                </button>
              ))}
            </>
          )}

          {displayItems && displayItems.length === 0 && !loading && (
            <div style={{ padding: "28px 20px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
              &quot;{query}&quot; için sonuç bulunamadı
            </div>
          )}

          {displayItems && displayItems.length > 0 && (
            <>
              <div style={{ padding: "6px 20px 4px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                Sonuçlar
              </div>
              {displayItems.map((item, i) => {
                const meta = TYPE_META[item.type] ?? TYPE_META.customer;
                return (
                  <button
                    key={item.id}
                    onClick={() => { router.push(item.href); onClose(); }}
                    style={{
                      width: "100%", padding: "10px 20px",
                      display: "flex", alignItems: "center", gap: 12,
                      background: cursor === i ? "var(--primary-light,#ede9fe)" : "transparent",
                      border: "none", cursor: "pointer", textAlign: "left",
                      color: "var(--text,#101828)",
                    }}
                    onMouseEnter={() => setCursor(i)}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: meta.color + "18",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 15,
                    }}>
                      {meta.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{item.title}</div>
                      {item.subtitle && <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{item.subtitle}</div>}
                    </div>
                    <span style={{
                      padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: meta.color + "18", color: meta.color,
                    }}>
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: "10px 20px", borderTop: "1px solid var(--border,#eaecf0)",
          display: "flex", gap: 16, fontSize: 11, color: "#94a3b8",
        }}>
          <span>↑↓ Gezin</span>
          <span>↵ Aç</span>
          <span>ESC Kapat</span>
        </div>
      </div>
    </>
  );
}
