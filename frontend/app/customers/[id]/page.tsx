"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/tz";

type Customer = {
  id: string; firstName: string; lastName: string;
  phone?: string; email?: string; birthDate?: string; gender?: string;
  notes?: string; leadStatus?: string; leadSource?: string; createdAt?: string;
};
type Appt = {
  id: string; serviceName?: string; procedureName?: string;
  startAtUtc: string; status: string; stylistName?: string;
};
type Invoice = { id: string; invoiceNumber: string; totalAmount: number; issueDate: string; status: string };

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [appts,    setAppts]    = useState<Appt[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tab,      setTab]      = useState<"overview"|"appointments"|"invoices">("overview");
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch(`/Customers/${id}`).then(r => r.ok ? r.json() : null),
      apiFetch(`/Appointments?customerId=${id}&pageSize=50`).then(r => r.ok ? r.json() : []),
      apiFetch(`/Invoices?customerId=${id}&pageSize=50`).then(r => r.ok ? r.json() : []),
    ]).then(([c, a, inv]) => {
      setCustomer(c);
      setAppts(a);
      setInvoices(inv);
    }).finally(() => setLoading(false));
  }, [id]);

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
            {customer.leadSource && <span>📍 {customer.leadSource}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#7c3aed" }}>{appts.length}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Randevu</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#22c55e" }}>
              ₺{invoices.reduce((sum, inv) => sum + inv.totalAmount, 0).toLocaleString("tr-TR")}
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Toplam Harcama</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(["overview","appointments","invoices"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`btn ${tab === t ? "btn-primary" : "btn-ghost"}`} style={{ padding: "8px 16px", minHeight: 40, fontSize: 13 }}>
            {t === "overview" ? "Genel" : t === "appointments" ? "Randevular" : "Faturalar"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Müşteri Bilgileri</div>
          <div className="form-grid" style={{ gap: 12 }}>
            {[
              ["Ad Soyad", `${customer.firstName} ${customer.lastName}`],
              ["Telefon",  customer.phone ?? "—"],
              ["E-posta",  customer.email ?? "—"],
              ["Doğum Tarihi", customer.birthDate ? customer.birthDate.slice(0, 10) : "—"],
              ["Cinsiyet", customer.gender ?? "—"],
              ["Kaynak",   customer.leadSource ?? "—"],
              ["Durum",    customer.leadStatus ?? "—"],
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
      )}

      {tab === "appointments" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
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
                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{a.stylistName ?? "—"}</td>
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
      )}

      {tab === "invoices" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
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
                  <td style={{ padding: "12px 16px", fontWeight: 700 }}>{inv.invoiceNumber}</td>
                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{inv.issueDate?.slice(0, 10)}</td>
                  <td style={{ padding: "12px 16px", fontWeight: 700, color: "#22c55e" }}>₺{inv.totalAmount.toLocaleString("tr-TR")}</td>
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
      )}
    </AppShell>
  );
}
