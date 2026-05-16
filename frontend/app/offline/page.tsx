"use client";

export default function OfflinePage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#0f172a",
      color: "#f1f5f9",
      fontFamily: "system-ui, -apple-system, sans-serif",
      gap: 20,
      padding: 32,
      textAlign: "center",
    }}>
      <div style={{
        width: 80,
        height: 80,
        borderRadius: 20,
        background: "#7c3aed",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3"/>
          <circle cx="6" cy="18" r="3"/>
          <line x1="20" y1="4" x2="8.12" y2="15.88"/>
          <line x1="14.47" y1="14.48" x2="20" y2="20"/>
          <line x1="8.12" y1="8.12" x2="12" y2="12"/>
        </svg>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Bağlantı Yok</div>
        <div style={{ color: "#94a3b8", fontSize: 15, maxWidth: 300, lineHeight: 1.6 }}>
          İnternet bağlantınız kesildi. Bağlantı geri gelince xCut otomatik olarak devam eder.
        </div>
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: "#7c3aed",
          color: "white",
          border: "none",
          borderRadius: 10,
          padding: "13px 28px",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Yeniden Dene
      </button>
    </div>
  );
}
