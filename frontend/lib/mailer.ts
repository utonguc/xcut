import nodemailer from "nodemailer";
import { readSmtpConfig, isSmtpConfigured } from "./smtp-config";

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const cfg = readSmtpConfig();
  if (!isSmtpConfigured(cfg)) return false;
  const t = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    tls: { rejectUnauthorized: false },
  });
  await t.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  return true;
}
