import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Salon Bul | Yakınınızdaki Kuaför & Güzellik Salonları — xCut",
  description:
    "xCut platformundaki tüm kuaför ve güzellik salonlarını keşfedin. Online randevu alın, hizmet ve fiyatları karşılaştırın.",
  alternates: { canonical: "https://xcut.xshield.com.tr/salon-bul" },
  openGraph: {
    title: "Salon Bul | Kuaför & Güzellik Salonu Dizini — xCut",
    description:
      "Yakınınızdaki kuaför ve güzellik salonlarını bulun, online randevu alın.",
    url: "https://xcut.xshield.com.tr/salon-bul",
    siteName: "xCut",
    locale: "tr_TR",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function SalonBulLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
