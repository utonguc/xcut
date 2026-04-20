import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/demo", "/salon-bul", "/site/"],
        disallow: [
          "/dashboard", "/appointments", "/customers", "/finance", "/kasa",
          "/raporlar", "/services", "/stylists", "/stock", "/takvim", "/tasks",
          "/website", "/whatsapp", "/ayarlar", "/superadmin",
        ],
      },
    ],
    sitemap: "https://xcut.xshield.com.tr/sitemap.xml",
  };
}
