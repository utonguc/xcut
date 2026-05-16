import fs from "fs";
import path from "path";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
  updatedAt: string;
};

const CONFIG_PATH = path.join(process.cwd(), "smtp-config.json");

export const DEFAULT_SMTP_CONFIG: SmtpConfig = {
  host: "",
  port: 587,
  secure: false,
  user: "noreply-xcut@xshield.com.tr",
  password: "",
  fromName: "xCut",
  fromEmail: "noreply-xcut@xshield.com.tr",
  updatedAt: "",
};

export function readSmtpConfig(): SmtpConfig {
  // JSON file (superadmin override) takes precedence
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SmtpConfig>;
    if (parsed.host) return { ...DEFAULT_SMTP_CONFIG, ...parsed };
  } catch {
    // no file
  }
  // Fall back to env vars (set via docker-compose, survive rebuilds)
  if (process.env.SMTP_HOST) {
    return {
      host:      process.env.SMTP_HOST     ?? "",
      port:      Number(process.env.SMTP_PORT) || 587,
      secure:    process.env.SMTP_SECURE === "true",
      user:      process.env.SMTP_USER     ?? "",
      password:  process.env.SMTP_PASS     ?? "",
      fromName:  process.env.SMTP_FROM_NAME ?? "xCut",
      fromEmail: process.env.SMTP_FROM     ?? process.env.SMTP_USER ?? "",
      updatedAt: "",
    };
  }
  return { ...DEFAULT_SMTP_CONFIG };
}

export function writeSmtpConfig(config: Partial<SmtpConfig>): void {
  const current = readSmtpConfig();
  const next: SmtpConfig = { ...current, ...config, updatedAt: new Date().toISOString() };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), "utf-8");
}

export function isSmtpConfigured(cfg: SmtpConfig): boolean {
  return Boolean(cfg.host && cfg.user && cfg.password);
}
