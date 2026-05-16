import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { salonName, city, specialty, tone, context: extra } = body;

    if (!salonName?.trim()) {
      return NextResponse.json({ error: "Salon adı zorunludur." }, { status: 400 });
    }

    const toneMap: Record<string, string> = {
      professional: "profesyonel ve kurumsal",
      warm:         "sıcak ve samimi",
      modern:       "modern ve dinamik",
      luxury:       "lüks ve sofistike",
    };
    const toneDesc = toneMap[tone] ?? "profesyonel";

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `Sen Türkiye'deki güzellik salonu ve berber web siteleri için SEO uyumlu içerik üreten bir metin yazarısın.
Tüm içerik Türkçe olacak. ${toneDesc} bir dil kullan.
Yanıtı şu JSON formatında ver (başka alan ekleme):
{
  "heroTitle": "kısa ve çarpıcı başlık (maks 60 karakter)",
  "heroSubtitle": "açıklayıcı alt başlık (maks 120 karakter)",
  "aboutText": "hakkımızda paragrafı (3-4 cümle, ${toneDesc} ton, samimi ve özgün)",
  "metaTitle": "SEO başlığı (maks 60 karakter, salon adı ve şehir içermeli)",
  "metaDescription": "SEO açıklaması (maks 155 karakter, hizmet ve konum vurgulu)",
  "metaKeywords": "virgülle ayrılmış 6-8 anahtar kelime"
}`,
        },
        {
          role: "user",
          content: `Salon Adı: ${salonName}
Şehir: ${city || "belirtilmedi"}
Uzmanlık / Hizmetler: ${specialty || "genel güzellik hizmetleri"}
Ek Bilgi: ${extra || "yok"}`,
        },
      ],
    });

    const content = JSON.parse(completion.choices[0].message.content ?? "{}");
    return NextResponse.json(content);
  } catch (err) {
    console.error("ai-website-content error:", err);
    return NextResponse.json(
      { error: "İçerik oluşturulamadı. Lütfen tekrar deneyin." },
      { status: 500 }
    );
  }
}
