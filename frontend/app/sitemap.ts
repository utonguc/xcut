import type { MetadataRoute } from "next";

const BASE = "https://xcut.xshield.com.tr";
const API  = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";

async function fetchPublishedSlugs(): Promise<Array<{ slug: string; updatedAtUtc: string }>> {
  try {
    const res = await fetch(`${API}/SalonWebsite/public-slugs`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now   = new Date();
  const slugs = await fetchPublishedSlugs();

  const salonEntries: MetadataRoute.Sitemap = slugs.map(s => ({
    url:             `${BASE}/site/${s.slug}`,
    lastModified:    new Date(s.updatedAtUtc),
    changeFrequency: "weekly",
    priority:        0.9,
  }));

  return [
    { url: BASE,                lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE}/demo`,      lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/salon-bul`, lastModified: now, changeFrequency: "daily",   priority: 0.7 },
    { url: `${BASE}/login`,     lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/privacy`,   lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE}/terms`,     lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    ...salonEntries,
  ];
}
