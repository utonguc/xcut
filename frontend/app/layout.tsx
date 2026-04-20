import "./globals.css";
import AuthGuard from "@/components/AuthGuard";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "xCut | Kuaför & Salon Yönetim Platformu — xShield",
  description:
    "xCut; kuaför ve güzellik salonları için randevu yönetimi, müşteri CRM, fatura, stok ve salon web sitesi builder içeren bulut tabanlı SaaS platformdur. Salonunuzu dijitalleştirin.",
  keywords: [
    "salon yönetim yazılımı", "kuaför randevu sistemi", "berber yazılımı",
    "güzellik salonu yönetim", "online randevu kuaför", "xCut", "xShield salon",
    "salon CRM", "kuaför fatura programı", "salon web sitesi",
  ],
  metadataBase: new URL("https://xcut.xshield.com.tr"),
  alternates: { canonical: "/" },
  openGraph: {
    title: "xCut | Kuaför & Salon Yönetim Platformu",
    description: "Randevu, müşteri takibi, fatura ve web sitesini tek platformdan yönetin.",
    url: "https://xcut.xshield.com.tr",
    siteName: "xCut by xShield",
    locale: "tr_TR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "xCut | Kuaför & Salon Yönetim Platformu",
    description: "Salonunuzu bulut tabanlı xCut platformuyla dijitalleştirin.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
