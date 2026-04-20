import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://xcut.xshield.com.tr";
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/demo`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/salon-bul`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
  ];
}
