import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { readSmtpConfig, isSmtpConfigured } from "@/lib/smtp-config";

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

export async function POST(req: NextRequest) {
  const ok = await requireSuperAdmin(req);
  if (!ok) return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });

  const cfg = readSmtpConfig();
  if (!isSmtpConfigured(cfg)) {
    return NextResponse.json({ error: "SMTP yapılandırılmamış." }, { status: 400 });
  }

  try {
    const { to, subject, html, text } = await req.json();
    if (!to || !subject) {
      return NextResponse.json({ error: "Alıcı ve konu zorunlu." }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.password },
    });

    await transporter.sendMail({
      from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to,
      subject,
      html: html ?? text,
      text: text ?? "",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-email error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Mail gönderilemedi." },
      { status: 500 }
    );
  }
}
