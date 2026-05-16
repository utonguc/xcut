import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Giriş Yap | xCut Salon Yönetim Paneli",
  description:
    "xCut salon yönetim paneline giriş yapın. Randevularınızı, müşterilerinizi ve işletmenizi yönetin.",
  alternates: { canonical: "https://xcut.xshield.com.tr/login" },
  openGraph: {
    title: "Giriş Yap | xCut",
    description: "xCut salon yönetim paneline giriş yapın.",
    url: "https://xcut.xshield.com.tr/login",
    siteName: "xCut",
    locale: "tr_TR",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
