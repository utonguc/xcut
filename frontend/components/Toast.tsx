"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

/* ── Types ──────────────────────────────────────────────────────── */
type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
  leaving: boolean;
}

interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ToastActions {
  success: (msg: string, duration?: number) => void;
  error:   (msg: string, duration?: number) => void;
  warning: (msg: string, duration?: number) => void;
  info:    (msg: string, duration?: number) => void;
}

interface ToastContextValue {
  toast:   ToastActions;
  confirm: (options: string | ConfirmOptions) => Promise<boolean>;
}

/* ── Context ────────────────────────────────────────────────────── */
const ToastCtx = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

/* ── Config ─────────────────────────────────────────────────────── */
const STYLE: Record<ToastType, { border: string; bg: string; iconBg: string; icon: string; text: string }> = {
  success: { border: "#22c55e", bg: "#f0fdf4", iconBg: "#22c55e", icon: "✓", text: "#15803d" },
  error:   { border: "#ef4444", bg: "#fef2f2", iconBg: "#ef4444", icon: "✕", text: "#b91c1c" },
  warning: { border: "#f59e0b", bg: "#fffbeb", iconBg: "#f59e0b", icon: "!",  text: "#b45309" },
  info:    { border: "#7c3aed", bg: "#faf5ff", iconBg: "#7c3aed", icon: "i",  text: "#6d28d9" },
};

const AUTO_DISMISS: Record<ToastType, number> = {
  success: 3000,
  info:    3000,
  warning: 4500,
  error:   5500,
};

let uid = 0;

/* ── Provider ───────────────────────────────────────────────────── */
interface ConfirmRequest extends ConfirmOptions {
  id: number;
  resolve: (v: boolean) => void;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts,   setToasts]   = useState<ToastItem[]>([]);
  const [confirms, setConfirms] = useState<ConfirmRequest[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts(p => p.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 320);
  }, []);

  const addToast = useCallback((type: ToastType, message: string, duration?: number) => {
    const id  = ++uid;
    const dur = duration ?? AUTO_DISMISS[type];
    setToasts(p => [...p, { id, type, message, duration: dur, leaving: false }]);
    setTimeout(() => dismiss(id), dur);
  }, [dismiss]);

  const toast: ToastActions = {
    success: (m, d) => addToast("success", m, d),
    error:   (m, d) => addToast("error",   m, d),
    warning: (m, d) => addToast("warning", m, d),
    info:    (m, d) => addToast("info",    m, d),
  };

  const confirm = useCallback((options: string | ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      const id   = ++uid;
      const opts = typeof options === "string" ? { message: options } : options;
      setConfirms(p => [...p, { id, ...opts, resolve }]);
    });
  }, []);

  const resolveConfirm = (id: number, value: boolean) => {
    setConfirms(p => {
      const item = p.find(c => c.id === id);
      if (item) item.resolve(value);
      return p.filter(c => c.id !== id);
    });
  };

  return (
    <ToastCtx.Provider value={{ toast, confirm }}>
      <style>{`
        @keyframes toast-in  { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes toast-out { from { transform: translateX(0);    opacity: 1; } to { transform: translateX(110%); opacity: 0; } }
      `}</style>

      {children}

      {/* ── Toast Stack (bottom-right) ── */}
      <div style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 9000,
        display: "flex", flexDirection: "column-reverse", gap: 8,
        pointerEvents: "none",
        maxWidth: 380,
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            pointerEvents: "all",
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "12px 14px 12px 12px",
            background: STYLE[t.type].bg,
            border: `1px solid ${STYLE[t.type].border}30`,
            borderLeft: `4px solid ${STYLE[t.type].border}`,
            borderRadius: 12,
            boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
            animation: t.leaving
              ? "toast-out 0.3s ease forwards"
              : "toast-in 0.3s ease forwards",
            minWidth: 260,
          }}>
            {/* Icon */}
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              background: STYLE[t.type].iconBg, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 900, flexShrink: 0, marginTop: 1,
              fontStyle: t.type === "info" ? "italic" : "normal",
            }}>
              {STYLE[t.type].icon}
            </div>

            {/* Message */}
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: STYLE[t.type].text, lineHeight: 1.45 }}>
              {t.message}
            </div>

            {/* Close */}
            <button onClick={() => dismiss(t.id)} style={{
              background: "none", border: "none", padding: "0 2px",
              fontSize: 18, lineHeight: 1, cursor: "pointer",
              color: STYLE[t.type].text, opacity: 0.55, flexShrink: 0,
            }}>×</button>
          </div>
        ))}
      </div>

      {/* ── Confirm Modal ── */}
      {confirms.map(c => (
        <div key={c.id}>
          <div
            onClick={() => resolveConfirm(c.id, false)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.50)", zIndex: 9100, backdropFilter: "blur(3px)" }}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 9101, width: "min(400px, 90vw)",
            background: "var(--surface, #fff)", borderRadius: 16,
            boxShadow: "0 24px 64px rgba(15,23,42,0.22)",
            border: "1px solid var(--border, #eaecf0)",
            padding: "22px 24px",
          }}>
            {c.title && (
              <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text, #101828)", marginBottom: 8 }}>{c.title}</div>
            )}
            <div style={{ fontSize: 14, color: "#475467", lineHeight: 1.65, marginBottom: 22 }}>{c.message}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => resolveConfirm(c.id, false)}
                className="btn btn-ghost" style={{ flex: 1 }}>
                {c.cancelLabel ?? "İptal"}
              </button>
              <button
                onClick={() => resolveConfirm(c.id, true)}
                style={{
                  flex: 2, padding: "10px 20px", borderRadius: 10,
                  fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer",
                  background: c.danger ? "#ef4444" : "#7c3aed", color: "#fff",
                }}>
                {c.confirmLabel ?? "Onayla"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </ToastCtx.Provider>
  );
}
