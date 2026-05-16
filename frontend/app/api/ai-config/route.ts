import { NextRequest, NextResponse } from "next/server";
import { readAiConfig, writeAiConfig, DEFAULT_SYSTEM_PROMPT } from "@/lib/ai-config";

const BACKEND = process.env.INTERNAL_API_URL ?? "http://xcut_backend:8080/api";

async function requireSuperAdmin(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    console.warn("[requireSuperAdmin] No Bearer token");
    return false;
  }
  try {
    const res = await fetch(`${BACKEND}/Auth/me`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) {
      console.warn("[requireSuperAdmin] Auth/me status:", res.status);
      return false;
    }
    const me = await res.json();
    console.log("[requireSuperAdmin] role:", me.role);
    return me.role === "SuperAdmin";
  } catch (e) {
    console.error("[requireSuperAdmin] fetch error:", e);
    return false;
  }
}

export async function GET() {
  return NextResponse.json(readAiConfig());
}

export async function POST(req: NextRequest) {
  const ok = await requireSuperAdmin(req);
  if (!ok) return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });

  try {
    const body = await req.json();

    if (body.action === "reset") {
      writeAiConfig({ systemPrompt: DEFAULT_SYSTEM_PROMPT, customKnowledge: [] });
      return NextResponse.json({ ok: true });
    }

    writeAiConfig({
      systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
      customKnowledge: Array.isArray(body.customKnowledge) ? body.customKnowledge : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("ai-config save error:", err);
    return NextResponse.json({ error: "Kayıt hatası." }, { status: 500 });
  }
}
