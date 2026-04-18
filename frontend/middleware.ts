import { NextRequest, NextResponse } from "next/server";

const APP_HOSTNAMES = new Set([
  "localhost",
  "xcut.xshield.com.tr",
  "app.xcut.xshield.com.tr",
]);

const APP_PATHS = new Set([
  "/",
  "/login",
  "/dashboard",
  "/appointments",
  "/customers",
  "/stylists",
  "/services",
  "/takvim",
  "/finance",
  "/stock",
  "/tasks",
  "/website",
  "/salon-bul",
  "/ayarlar",
  "/superadmin",
  "/site",
  "/portal",
  "/_next",
  "/favicon",
  "/api",
]);

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const host = req.headers.get("host") ?? "";
  const hostNoPort = host.split(":")[0];

  // If it's an app hostname → pass through
  if (APP_HOSTNAMES.has(hostNoPort)) return NextResponse.next();

  // If the path belongs to the app → pass through
  const firstSegment = "/" + url.pathname.split("/")[1];
  if (APP_PATHS.has(firstSegment)) return NextResponse.next();

  // Extract subdomain slug
  let slug = "";
  // *.xcut.xshield.com.tr  or  *.xshield.com.tr
  const xcutMatch = hostNoPort.match(/^([^.]+)\.xcut\.xshield\.com\.tr$/);
  const shieldMatch = hostNoPort.match(/^([^.]+)\.xshield\.com\.tr$/);
  const localhostMatch = hostNoPort.match(/^([^.]+)\.localhost$/);

  if (xcutMatch) {
    slug = xcutMatch[1];
  } else if (shieldMatch) {
    slug = shieldMatch[1];
  } else if (localhostMatch) {
    slug = localhostMatch[1];
  } else {
    // Unknown domain — treat as domain-based slug
    slug = `_domain_${hostNoPort}`;
  }

  url.pathname = `/site/${slug}${url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
