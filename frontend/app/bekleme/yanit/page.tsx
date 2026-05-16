"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

type Result = "accepted" | "declined" | "expired" | "notfound" | "already";

const CONTENT: Record<Result, { icon: string; title: string; text: string; color: string }> = {
  accepted: {
    icon:  "✅",
    title: "Randevunuz Oluşturuldu!",
    text:  "Teklifimizi kabul ettiğiniz için teşekkürler. Randevunuz takvime işlendi. Salonumuzda görüşmek üzere!",
    color: "#22c55e",
  },
  declined: {
    icon:  "❌",
    title: "Yanıtınız Alındı",
    text:  "Teklifi reddettiğinizi kaydettik. Başka bir uygun zaman oluştuğunda tekrar ulaşacağız.",
    color: "#ef4444",
  },
  expired: {
    icon:  "⏰",
    title: "Teklif Süresi Doldu",
    text:  "Bu teklifin geçerlilik süresi dolmuş. Lütfen salonumuzla iletişime geçin.",
    color: "#f59e0b",
  },
  notfound: {
    icon:  "🔍",
    title: "Teklif Bulunamadı",
    text:  "Bu bağlantı geçersiz veya daha önce kullanılmış. Lütfen salonumuzla iletişime geçin.",
    color: "#6b7280",
  },
  already: {
    icon:  "ℹ️",
    title: "Daha Önce Yanıtlandı",
    text:  "Bu teklife daha önce yanıt verilmiş. Başka bir işlem yapmanıza gerek yok.",
    color: "#3b82f6",
  },
};

function YanitContent() {
  const params = useSearchParams();
  const result = (params.get("result") ?? "notfound") as Result;
  const c      = CONTENT[result] ?? CONTENT.notfound;

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f9fafb", padding:20 }}>
      <div style={{ background:"#fff", borderRadius:16, padding:40, maxWidth:480, width:"100%", textAlign:"center", boxShadow:"0 4px 24px rgba(0,0,0,.08)" }}>
        <div style={{ fontSize:64, marginBottom:16 }}>{c.icon}</div>
        <div style={{ fontSize:24, fontWeight:800, color:c.color, marginBottom:12 }}>{c.title}</div>
        <div style={{ fontSize:16, color:"#4b5563", lineHeight:1.6, marginBottom:28 }}>{c.text}</div>
        <div style={{ fontSize:13, color:"#9ca3af" }}>xCut — Salon Yönetim Sistemi</div>
      </div>
    </div>
  );
}

export default function YanitPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>Yükleniyor...</div>}>
      <YanitContent />
    </Suspense>
  );
}
