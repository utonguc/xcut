"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (localStorage.getItem("pwa-dismissed")) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;

    if (isIOS) {
      setTimeout(() => { setShowIOS(true); setVisible(true); }, 10000);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setVisible(true), 10000);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setVisible(false);
    if (outcome === "dismissed") localStorage.setItem("pwa-dismissed", "1");
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem("pwa-dismissed", "1");
  };

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 88,
      left: 12,
      right: 12,
      background: "#1e1b4b",
      border: "1px solid rgba(124,58,237,0.4)",
      borderRadius: 16,
      padding: "14px 16px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      zIndex: 9999,
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, background: "#7c3aed",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3"/>
          <circle cx="6" cy="18" r="3"/>
          <line x1="20" y1="4" x2="8.12" y2="15.88"/>
          <line x1="14.47" y1="14.48" x2="20" y2="20"/>
          <line x1="8.12" y1="8.12" x2="12" y2="12"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 14 }}>xCut&apos;u Yükle</div>
        <div style={{ color: "#c4b5fd", fontSize: 12, marginTop: 2 }}>
          {showIOS
            ? "Paylaş → \"Ana Ekrana Ekle\"ye dokunun"
            : "Uygulamayı ana ekrana ekleyerek hızlı açın"}
        </div>
      </div>
      {!showIOS && (
        <button
          onClick={handleInstall}
          style={{
            background: "#7c3aed", color: "white", border: "none",
            borderRadius: 8, padding: "8px 14px", fontSize: 13,
            fontWeight: 700, cursor: "pointer", flexShrink: 0,
          }}
        >
          Yükle
        </button>
      )}
      <button
        onClick={dismiss}
        style={{
          background: "none", border: "none", color: "#64748b",
          cursor: "pointer", padding: "4px 6px", flexShrink: 0, fontSize: 20, lineHeight: 1,
        }}
        aria-label="Kapat"
      >
        ×
      </button>
    </div>
  );
}
