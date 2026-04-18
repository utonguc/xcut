import "./globals.css";
import AuthGuard from "@/components/AuthGuard";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "xCut",
  description: "Salon Yönetim Platformu",
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
