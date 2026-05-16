import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const BACKEND = process.env.INTERNAL_API_URL ?? "http://xcut_backend:8080/api";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    // Step 1: AI ile kullanıcı niyetini ayrıştır
    const intentRes = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `Sen Türkçe konuşan bir salon arama asistanısın. Kullanıcının mesajlarından şehir, hizmet türü ve genel sorgu bilgilerini çıkar.
Yanıtı şu JSON formatında ver:
{
  "city": "şehir adı veya null",
  "service": "hizmet türü veya null",
  "query": "diğer arama terimi veya null",
  "reply": "kullanıcıya yönelik Türkçe samimi ve kısa yanıt. Salon bulunursa 'Bulduğum salonlar aşağıda listelendi.' gibi yönlendirici bir cümle ekle. Bulunamazsa alternatif öneri sun."
}
Bilinen hizmet türleri: saç, tırnak, cilt, makyaj, erkek, kaş-kirpik, masaj, epilasyon, solaryum.
Kullanıcı yalnızca şehir veya hizmet söylüyorsa bile sonuç çıkarmaya çalış.`,
        },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      ],
    });

    let parsed: { city?: string; service?: string; query?: string; reply: string };
    try {
      parsed = JSON.parse(intentRes.choices[0].message.content ?? "{}");
    } catch {
      parsed = { reply: "Üzgünüm, isteğinizi anlayamadım. Lütfen tekrar deneyin." };
    }

    // Step 2: Backend'den salon listesi çek
    type BackendSalon = {
      slug: string;
      name: string;
      city?: string;
      address?: string;
      phone?: string;
      logoUrl?: string;
      primaryColor?: string;
      bookingEnabled?: boolean;
      specialties?: string[];
    };

    let salons: BackendSalon[] = [];
    try {
      const params = new URLSearchParams();
      if (parsed.city)    params.set("city",      parsed.city);
      if (parsed.service) params.set("specialty", parsed.service);
      if (parsed.query)   params.set("q",         parsed.query);
      params.set("pageSize", "12");

      const backendRes = await fetch(`${BACKEND}/public/salons?${params}`, {
        signal: AbortSignal.timeout(5000),
      });

      if (backendRes.ok) {
        const data = await backendRes.json();
        const raw: BackendSalon[] = Array.isArray(data) ? data : (data.items ?? []);
        salons = raw;
      }
    } catch {
      // Salon listesi çekilemedi — sadece AI yanıtı dön
    }

    // Frontend Salon tipiyle uyumlu formata çevir
    const mappedSalons = salons.map(s => ({
      slug:           s.slug,
      name:           s.name ?? "",
      city:           s.city ?? "",
      address:        s.address ?? "",
      phone:          s.phone ?? "",
      logoUrl:        s.logoUrl,
      primaryColor:   s.primaryColor ?? "#7c3aed",
      bookingEnabled: s.bookingEnabled ?? true,
      services:       s.specialties ?? [],
    }));

    return NextResponse.json({
      reply: parsed.reply,
      salons: mappedSalons,
      filters: {
        city:    parsed.city    ?? null,
        service: parsed.service ?? null,
        query:   parsed.query   ?? null,
      },
    });
  } catch (err) {
    console.error("ai-salon-search error:", err);
    return NextResponse.json(
      { error: "Yapay zeka servisi şu anda kullanılamıyor." },
      { status: 500 }
    );
  }
}
