"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch, API_BASE_URL, getToken } from "@/lib/api";
import { fmtDateTime } from "@/lib/tz";
import { useToast } from "@/components/Toast";

type Customer = {
  id: string; firstName: string; lastName: string;
  phone?: string; email?: string; birthDate?: string; gender?: string;
  notes?: string; customerStatus?: string; createdAt?: string;
};
type Appt = {
  id: string; serviceName?: string; procedureName?: string;
  startAtUtc: string; status: string; stylistFullName?: string;
};
type Invoice = { id: string; invoiceNo: string; total: number; issuedAtUtc: string; status: string };
type Photo   = { id: string; photoUrl: string; type: string; serviceName?: string; notes?: string; createdAtUtc: string };

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast, confirm } = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [appts,    setAppts]    = useState<Appt[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [photos,   setPhotos]   = useState<Photo[]>([]);
  const [tab,      setTab]      = useState<"overview"|"appointments"|"invoices"|"photos">("overview");
  const [loading,  setLoading]  = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPhotos = async () => {
    const r = await apiFetch(`/Customers/${id}/photos`);
    if (r.ok) setPhotos(await r.json());
  };

  useEffect(() => {
    Promise.all([
      apiFetch(`/Customers/${id}`).then(r => r.ok ? r.json() : null),
      apiFetch(`/Appointments?customerId=${id}&pageSize=50`).then(r => r.ok ? r.json() : []),
      apiFetch(`/Invoices?customerId=${id}&pageSize=50`).then(r => r.ok ? r.json() : { items: [] }),
      apiFetch(`/Customers/${id}/photos`).then(r => r.ok ? r.json() : []),
    ]).then(([c, a, inv, ph]) => {
      setCustomer(c); setAppts(a); setInvoices(inv?.items ?? []); setPhotos(ph);
    }).finally(() => setLoading(false));
  }, [id]);

  const uploadPhoto = async (file: File, type: string) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", type);
    const res = await fetch(`${API_BASE_URL}/Customers/${id}/photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd,
    });
    setUploading(false);
    if (res.ok) { toast.success("Fotoğraf yüklendi."); loadPhotos(); }
    else toast.error("Yüklenemedi.");
  };

  const deletePhoto = async (photoId: string) => {
    if (!await confirm("Bu fotoğrafı silmek istediğinize emin misiniz?")) return;
    const r = await apiFetch(`/Customers/${id}/photos/${photoId}`, { method: "DELETE" });
    if (r.ok) { toast.success("Silindi."); loadPhotos(); }
    else toast.error("Silinemedi.");
  };

  if (loading) return (
    <AppShell title="Müşteri Detayı">
      <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
        Yükleniyor...
      </div>
    </AppShell>
  );

  if (!customer) return (
    <AppShell title="Müşteri Bulunamadı">
      <div style={{ padding: 60, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>Müşteri bulunamadı</div>
        <button onClick={() => router.push("/customers")} className="btn btn-primary">← Geri Dön</button>
      </div>
    </AppShell>
  );

  return (
    <AppShell
      title={`${customer.firstName} ${customer.lastName}`}
      description="Müşteri profili ve geçmişi"
      actions={
        <button onClick={() => router.push("/customers")} className="btn btn-ghost" style={{ fontSize: 13 }}>← Müşteriler</button>
      }
    >
      {/* Profile card */}
      <div className="card" style={{ marginBottom: 20, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%", flexShrink: 0,
          background: "var(--primary,#7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 900, fontSize: 26,
        }}>
          {customer.firstName[0]}{customer.lastName[0]}
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>{customer.firstName} {customer.lastName}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 14, color: "#64748b" }}>
            {customer.phone  && <span>📞 {customer.phone}</span>}
            {customer.email  && <span>✉️ {customer.email}</span>}
            {customer.gender && <span>👤 {customer.gender === "Male" ? "Erkek" : customer.gender === "Female" ? "Kadın" : "Diğer"}</span>}
            {customer.customerStatus && <span>🏷 {customer.customerStatus}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#7c3aed" }}>{appts.length}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Randevu</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#22c55e" }}>
              ₺{invoices.reduce((sum, inv) => sum + inv.total, 0).toLocaleString("tr-TR")}
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Toplam Harcama</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {(["overview","appointments","invoices","photos"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`btn ${tab === t ? "btn-primary" : "btn-ghost"}`} style={{ padding: "8px 16px", minHeight: 40, fontSize: 13 }}>
            {t === "overview" ? "Genel" : t === "appointments" ? "Randevular" : t === "invoices" ? "Faturalar" : `📷 Fotoğraflar${photos.length > 0 ? ` (${photos.length})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Müşteri Bilgileri</div>
            <div className="form-grid" style={{ gap: 12 }}>
              {[
                ["Ad Soyad", `${customer.firstName} ${customer.lastName}`],
                ["Telefon",  customer.phone ?? "—"],
                ["E-posta",  customer.email ?? "—"],
                ["Doğum Tarihi", customer.birthDate ? customer.birthDate.slice(0, 10) : "—"],
                ["Cinsiyet", customer.gender ?? "—"],
                ["Durum",    customer.customerStatus ?? "—"],
                ["Kayıt Tarihi", customer.createdAt ? fmtDateTime(customer.createdAt) : "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 2, textTransform: "uppercase" }}>{k}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text,#101828)" }}>{v}</div>
                </div>
              ))}
            </div>
            {customer.notes && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase" }}>Notlar</div>
                <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>{customer.notes}</p>
              </div>
            )}
          </div>

          {/* Visit history */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Ziyaret Geçmişi</span>
              <span className="badge" style={{ background: "#ede9fe", color: "#7c3aed" }}>{appts.length}</span>
            </div>
            {appts.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Henüz randevu kaydı yok</div>
            ) : (
              <div style={{ position: "relative" }}>
                {/* Timeline line */}
                <div style={{ position: "absolute", left: 31, top: 0, bottom: 0, width: 2, background: "var(--border,#f2f4f7)", zIndex: 0 }} />
                {[...appts].sort((a, b) => new Date(b.startAtUtc).getTime() - new Date(a.startAtUtc).getTime()).map((a, i) => {
                  const isCompleted = a.status === "Completed";
                  const isCancelled = a.status === "Cancelled";
                  const dotColor = isCompleted ? "#22c55e" : isCancelled ? "#ef4444" : "#7c3aed";
                  const statusLabel = a.status === "Scheduled" ? "Planlandı" : a.status === "Completed" ? "Tamamlandı" : a.status === "Cancelled" ? "İptal" : a.status === "NoShow" ? "Gelmedi" : a.status;
                  const statusBg = isCompleted ? "#dcfce7" : isCancelled ? "#fee2e2" : "#ede9fe";
                  const statusColor = isCompleted ? "#166534" : isCancelled ? "#991b1b" : "#7c3aed";
                  return (
                    <div key={a.id} style={{ display: "flex", gap: 0, padding: "14px 16px", borderBottom: i < appts.length - 1 ? "1px solid var(--border,#f2f4f7)" : "none", position: "relative", zIndex: 1 }}>
                      {/* Dot */}
                      <div style={{
                        width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                        background: dotColor, marginTop: 3, marginRight: 18, marginLeft: 10,
                        boxShadow: `0 0 0 3px white, 0 0 0 4px ${dotColor}40`,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text,#101828)" }}>
                              {a.serviceName ?? a.procedureName ?? "Hizmet belirtilmemiş"}
                            </div>
                            {a.stylistFullName && (
                              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                                ✂️ {a.stylistFullName}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>{fmtDateTime(a.startAtUtc)}</div>
                            <span className="badge" style={{ background: statusBg, color: statusColor, fontSize: 11 }}>{statusLabel}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "appointments" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 400 }}>
            <thead>
              <tr style={{ background: "var(--surface-2,#f8fafc)" }}>
                {["Hizmet","Stilist","Tarih","Durum"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "#64748b", borderBottom: "1px solid var(--border,#eaecf0)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {appts.length === 0 && <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Randevu bulunamadı</td></tr>}
              {appts.map(a => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--border,#f2f4f7)" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 600 }}>{a.serviceName ?? a.procedureName}</td>
                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{a.stylistFullName ?? "—"}</td>
                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{fmtDateTime(a.startAtUtc)}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span className="badge" style={{ background: a.status === "Completed" ? "#dcfce7" : "#ede9fe", color: a.status === "Completed" ? "#166534" : "#7c3aed" }}>
                      {a.status === "Scheduled" ? "Planlandı" : a.status === "Completed" ? "Tamamlandı" : a.status === "Cancelled" ? "İptal" : a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {tab === "invoices" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 400 }}>
            <thead>
              <tr style={{ background: "var(--surface-2,#f8fafc)" }}>
                {["Fatura No","Tarih","Tutar","Durum"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "#64748b", borderBottom: "1px solid var(--border,#eaecf0)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Fatura bulunamadı</td></tr>}
              {invoices.map(inv => (
                <tr key={inv.id} style={{ borderBottom: "1px solid var(--border,#f2f4f7)" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 700 }}>{inv.invoiceNo}</td>
                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{inv.issuedAtUtc?.slice(0, 10)}</td>
                  <td style={{ padding: "12px 16px", fontWeight: 700, color: "#22c55e" }}>₺{inv.total.toLocaleString("tr-TR")}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span className="badge" style={{ background: inv.status === "Paid" ? "#dcfce7" : "#fef3c7", color: inv.status === "Paid" ? "#166534" : "#92400e" }}>
                      {inv.status === "Paid" ? "Ödendi" : inv.status === "Pending" ? "Beklemede" : inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      {tab === "photos" && (
        <div>
          {/* Upload buttons */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, (fileRef.current as any)?._type ?? "After"); (e.target as HTMLInputElement).value = ""; }} />
            {(["Before","After","General"] as const).map(type => (
              <button key={type} disabled={uploading}
                onClick={() => { if (fileRef.current) { (fileRef.current as any)._type = type; fileRef.current.click(); } }}
                style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", color: "#344054" }}>
                {uploading ? "Yükleniyor..." : `+ ${type === "Before" ? "Öncesi" : type === "After" ? "Sonrası" : "Genel"} Fotoğraf`}
              </button>
            ))}
          </div>

          {photos.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", background: "#fafafa", borderRadius: 12, border: "1px dashed #e2e8f0" }}>
              Henüz fotoğraf yüklenmemiş.
            </div>
          ) : (
            <div>
              {(["Before","After","General"] as const).filter(type => photos.some(p => p.type === type)).map(type => (
                <div key={type} style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
                    {type === "Before" ? "Öncesi" : type === "After" ? "Sonrası" : "Genel"}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                    {photos.filter(p => p.type === type).map(p => (
                      <div key={p.id} style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                        <img
                          src={`${API_BASE_URL.replace("/api", "")}${p.photoUrl}`}
                          alt={p.serviceName ?? type}
                          style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
                        />
                        <div style={{ padding: "8px 10px" }}>
                          {p.serviceName && <div style={{ fontSize: 11, fontWeight: 700, color: "#344054" }}>{p.serviceName}</div>}
                          {p.notes       && <div style={{ fontSize: 11, color: "#64748b" }}>{p.notes}</div>}
                          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{new Date(p.createdAtUtc).toLocaleDateString("tr-TR")}</div>
                        </div>
                        <button onClick={() => deletePhoto(p.id)}
                          style={{ position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: "50%", border: "none", background: "#0009", color: "#fff", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
