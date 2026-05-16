import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { readAiConfig, buildSystemContent } from "@/lib/ai-config";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const PAGE_HINTS: Record<string, string> = {
  "/dashboard":    "Kullanıcı Dashboard sayfasında. Özelleştirilebilir widget'lar var: sürükle-bırak sıralama, 1×/2×/4× boyut seçimi, widget yenileme butonu. Sağ üstte 'Düzenle' butonu var.",
  "/appointments": "Kullanıcı Randevular sayfasında. Randevu listesi, durum filtreleri (Bekliyor/Onaylandı/Tamamlandı/İptal), yeni randevu ekleme ve randevu talepleri var. Randevu onaylanınca müşteriye otomatik mail gönderilir.",
  "/takvim":       "Kullanıcı Takvim sayfasında. Stilist bazlı haftalık/günlük takvim görünümü. Stilist filtresi ve takvim üzerinden hızlı randevu oluşturma var.",
  "/customers":    "Kullanıcı Müşteriler sayfasında. Müşteri listesi, arama, durum filtresi. Müşteri kartında ziyaret geçmişi, toplam harcama, notlar ve fotoğraf var.",
  "/stylists":     "Kullanıcı Stilistler sayfasında. Stilist profili: uzmanlık, biyografi, fotoğraf, çalışma saatleri ve izin günleri yönetimi.",
  "/personel":     "Kullanıcı Personel sayfasında. Kullanıcı hesapları ve rol atamaları (SalonYonetici, Stilist, Resepsiyon, Admin). Şifre sıfırlama ve hesap yönetimi.",
  "/services":     "Kullanıcı Hizmetler sayfasında. Hizmet adı, fiyat, süre, kategori, açıklama ve online görünürlük ayarları.",
  "/stock":        "Kullanıcı Stok sayfasında. Ürün/malzeme takibi, kritik stok seviyesi ayarı, giriş/çıkış kaydı.",
  "/kasa":         "Kullanıcı Kasa sayfasında. Günlük kasa açma/kapama, ödeme alma (nakit/kart/havale), ürün ve hizmet satışı. Ödeme sonrası müşteriye mail makbuz gönderilebilir.",
  "/finance":      "Kullanıcı Finans sayfasında. Gelir/gider kayıtları, fatura oluşturma ve PDF indirme, tarih bazlı raporlama.",
  "/raporlar":     "Kullanıcı Raporlar sayfasında. Salon performans raporu, stilist bazlı analiz, aylık gelir/randevu grafikleri, hizmet dağılımı.",
  "/tasks":        "Kullanıcı Görevler sayfasında. Görev oluşturma, öncelik atama, sorumlu belirleme, durum takibi.",
  "/website":      "Kullanıcı Web Sitesi sayfasında. Salon public web sitesi düzenleme, AI ile içerik oluşturma, online randevu formu, SEO ayarları, domain bağlama.",
  "/crm":          "Kullanıcı CRM sayfasında. Üç sekme: Mail Şablonları (özel şablon oluşturma/düzenleme), Toplu Mail (müşteri seçimi + şablon ile toplu mail gönderme), SMS (yakında). Toplu mail paralel gönderilir, buton (X/Toplam) sayacı gösterir.",
  "/ayarlar":      "Kullanıcı Ayarlar sayfasında. Sekmeler: Genel (salon bilgileri), Bildirimler (hangi olaylarda mail gitsin), Entegrasyonlar (Google Takvim, WhatsApp API, Kiosk kodu), Güvenlik (şifre değişikliği).",
  "/bekleme":      "Kullanıcı Bekleme Listesi sayfasında. Randevu bekleyen müşteriler, istenen stilist ve hizmet bilgisi.",
  "/denetim":      "Kullanıcı Denetim Logu sayfasında. Sistemdeki tüm işlem kayıtları: kim, ne zaman, ne yaptı.",
  "/sira":         "Kullanıcı Sıra Yönetimi sayfasında. TV ekranında gösterilebilen dijital sıra sistemi. Müşteriler kiosk ile sıraya eklenebilir.",
};

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Mesaj listesi boş." }, { status: 400 });
    }

    const pageHint = context?.page ? (PAGE_HINTS[context.page] ?? "") : "";
    const aiConfig = readAiConfig();
    const systemContent = buildSystemContent(aiConfig, pageHint || undefined);

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.5,
      max_tokens: 600,
      messages: [
        { role: "system", content: systemContent },
        ...messages.slice(-12).map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
    });

    const reply = completion.choices[0].message.content ?? "Üzgünüm, yanıt oluşturulamadı.";
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("ai-chat error:", err);
    return NextResponse.json(
      { error: "Yapay zeka servisi şu anda kullanılamıyor." },
      { status: 500 }
    );
  }
}
