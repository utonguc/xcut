import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "xCut — Salon Yönetim Platformu",
    short_name: "xCut",
    description: "Kuaför ve güzellik salonları için bulut tabanlı yönetim platformu",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#7c3aed",
    orientation: "portrait-primary",
    lang: "tr",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/maskable-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    categories: ["business", "productivity"],
    shortcuts: [
      {
        name: "Randevular",
        url: "/appointments",
        description: "Randevu takvimini görüntüle",
      },
      {
        name: "Yeni Randevu",
        url: "/appointments?new=1",
        description: "Hızlı randevu oluştur",
      },
      {
        name: "Müşteriler",
        url: "/customers",
        description: "Müşteri listesi",
      },
    ],
  };
}
