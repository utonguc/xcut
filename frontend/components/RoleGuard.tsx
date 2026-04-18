"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Props {
  roles: string[];
  children: React.ReactNode;
}

export default function RoleGuard({ roles, children }: Props) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch("/Auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(user => {
        if (!user) { setAllowed(false); return; }
        setAllowed(roles.includes(user.role));
      })
      .catch(() => setAllowed(false));
  }, [roles]);

  if (allowed === null) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Erişim Reddedildi</div>
        <div style={{ color: "#64748b", fontSize: 14 }}>Bu sayfayı görüntüleme yetkiniz yok.</div>
      </div>
    );
  }

  return <>{children}</>;
}
