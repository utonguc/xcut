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
  "/kasa",
  "/kiosk",
  "/sira",
  "/bekleme",
  "/paketler",
  "/demo",
  "/superadmin",
  "/site",
  "/portal",
  "/offline",
  "/_next",
  "/favicon",
  "/api",
]);

function noCache(allowEmbed = false): NextResponse {
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  if (allowEmbed) {
    // Allow this page to be embedded in external websites via iframe
    res.headers.set("Content-Security-Policy", "frame-ancestors *");
  }
  return res;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const host = req.headers.get("host") ?? "";
  const hostNoPort = host.split(":")[0];

  // Booking pages must be embeddable via iframe on external sites
  const isBookPath = url.pathname.match(/^\/site\/[^/]+\/book(\/|$|\?|#)/);
  if (isBookPath) return noCache(true);

  // If it's an app hostname → pass through (no CDN caching for app pages)
  if (APP_HOSTNAMES.has(hostNoPort)) return noCache();

  // If the path belongs to the app → pass through (no CDN caching)
  const firstSegment = "/" + url.pathname.split("/")[1];
  if (APP_PATHS.has(firstSegment)) return noCache();

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|workbox-.*\\.js).*)"],
};
