import "./globals.css";
import Script from "next/script";
import AuthGuard from "@/components/AuthGuard";
import { ToastProvider } from "@/components/Toast";
import InstallPrompt from "@/components/InstallPrompt";
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
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: "/icons/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#7c3aed",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-0TGBG8VV67" strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-0TGBG8VV67');
        `}</Script>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "xCut",
          "url": "https://xcut.xshield.com.tr",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "description": "Kuaför ve güzellik salonları için randevu yönetimi, müşteri CRM, fatura, stok ve salon web sitesi builder içeren bulut tabanlı SaaS platformu.",
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "TRY", "description": "Ücretsiz demo" },
          "publisher": { "@type": "Organization", "name": "xShield", "url": "https://xcut.xshield.com.tr" },
          "inLanguage": "tr",
          "featureList": ["Randevu Yönetimi","Müşteri CRM","Online Rezervasyon","Fatura & Kasa","Stok Takibi","Salon Web Sitesi"],
        }) }} />
      </head>
      <body>
        <ToastProvider>
          <AuthGuard>{children}</AuthGuard>
        </ToastProvider>
        <InstallPrompt />
      </body>
    </html>
  );
}
