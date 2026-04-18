import React from "react";

/** Primary button style */
export const btn = (extra?: React.CSSProperties): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "10px 18px",
  borderRadius: 10,
  border: "none",
  background: "var(--primary,#7c3aed)",
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  minHeight: 44,
  ...extra,
});

/** Ghost button style */
export const btnGhost = (extra?: React.CSSProperties): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "10px 18px",
  borderRadius: 10,
  border: "1px solid var(--border,#e4e7ec)",
  background: "transparent",
  color: "var(--text-2,#344054)",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  minHeight: 44,
  ...extra,
});

/** Input style */
export const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  border: "1px solid var(--border,#d0d5dd)",
  fontSize: 14,
  boxSizing: "border-box",
  background: "var(--surface,#fff)",
  color: "var(--text,#101828)",
  minHeight: 44,
  outline: "none",
  WebkitAppearance: "none",
  ...extra,
});
