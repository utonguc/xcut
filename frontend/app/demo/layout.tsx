import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ücretsiz Demo İsteyin | xCut Salon Yönetim Platformu",
  description:
    "xCut'ı ücretsiz deneyin. Kuaför ve güzellik salonları için randevu, CRM, fatura, stok ve web sitesi — hepsini tek platformdan yönetin. Demo talep edin.",
  alternates: { canonical: "https://xcut.xshield.com.tr/demo" },
  openGraph: {
    title: "Ücretsiz Demo İsteyin | xCut",
    description:
      "Salonunuzu dijitalleştirin. Randevu yönetimi, müşteri CRM, online rezervasyon ve daha fazlası.",
    url: "https://xcut.xshield.com.tr/demo",
    siteName: "xCut",
    locale: "tr_TR",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
