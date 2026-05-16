import type { Metadata } from "next";
import SalonPage from "./SalonPage";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";
const BASE = "https://xcut.xshield.com.tr";

type Props = { params: { slug: string } };

async function fetchSalon(slug: string) {
  try {
    const res = await fetch(`${API}/SalonWebsite/public/${slug}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await fetchSalon(params.slug);
  if (!data) {
    return { title: "Salon Bulunamadı — xCut" };
  }

  const w = data.website;
  const salonName = w.name as string;
  const title = w.metaTitle ?? `${salonName} | Online Randevu — xCut`;
  const description =
    w.metaDescription ??
    w.heroSubtitle ??
    (w.aboutText ? (w.aboutText as string).slice(0, 160) : null) ??
    `${salonName} online randevu al, hizmet ve fiyatları gör.`;
  const url = `${BASE}/site/${params.slug}`;
  const image = w.heroImageUrl as string | undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "xCut",
      locale: "tr_TR",
      type: "website",
      images: image ? [{ url: image, width: 1200, height: 630, alt: salonName }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export default async function Page({ params }: Props) {
  const data = await fetchSalon(params.slug);
  const w = data?.website;

  const jsonLd = w
    ? {
        "@context": "https://schema.org",
        "@type": "BeautySalon",
        name: w.name,
        url: `${BASE}/site/${params.slug}`,
        ...(w.phone      && { telephone: w.phone }),
        ...(w.email      && { email: w.email }),
        ...(w.heroImageUrl && { image: w.heroImageUrl }),
        ...(w.aboutText  && { description: (w.aboutText as string).slice(0, 300) }),
        ...(w.address    && {
          address: {
            "@type": "PostalAddress",
            streetAddress: w.address,
          },
        }),
        ...(w.googleMapsUrl && { hasMap: w.googleMapsUrl }),
        ...(w.instagramUrl  && {
          sameAs: [w.instagramUrl, ...(w.facebookUrl ? [w.facebookUrl] : [])],
        }),
        potentialAction: w.bookingEnabled
          ? {
              "@type": "ReserveAction",
              target: `${BASE}/site/${params.slug}/book`,
              "result": { "@type": "Reservation", name: "Online Randevu" },
            }
          : undefined,
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <SalonPage slug={params.slug} />
    </>
  );
}
