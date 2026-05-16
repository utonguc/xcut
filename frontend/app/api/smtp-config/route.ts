import { NextRequest, NextResponse } from "next/server";
import { readSmtpConfig, writeSmtpConfig } from "@/lib/smtp-config";

const BACKEND = process.env.INTERNAL_API_URL ?? "http://xcut_backend:8080/api";

async function requireSuperAdmin(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  try {
    const res = await fetch(`${BACKEND}/Auth/me`, { headers: { Authorization: auth } });
    if (!res.ok) return false;
    const me = await res.json();
    return me.role === "SuperAdmin";
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const ok = await requireSuperAdmin(req);
  if (!ok) return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  const cfg = readSmtpConfig();
  // Şifreyi maskele GET yanıtında
  return NextResponse.json({ ...cfg, password: cfg.password ? "••••••••" : "" });
}

export async function POST(req: NextRequest) {
  const ok = await requireSuperAdmin(req);
  if (!ok) return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  try {
    const body = await req.json();
    // Eğer şifre "••••••••" gelirse mevcut şifreyi koru
    const current = readSmtpConfig();
    writeSmtpConfig({
      host:      body.host      ?? current.host,
      port:      Number(body.port) || current.port,
      secure:    Boolean(body.secure),
      user:      body.user      ?? current.user,
      password:  body.password === "••••••••" ? current.password : (body.password ?? current.password),
      fromName:  body.fromName  ?? current.fromName,
      fromEmail: body.fromEmail ?? current.fromEmail,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("smtp-config save error:", err);
    return NextResponse.json({ error: "Kayıt hatası." }, { status: 500 });
  }
}
