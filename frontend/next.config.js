const withPWA = require("@ducanh2912/next-pwa").default;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = withPWA({
  dest: "public",
  disable: false,
  fallbacks: {
    document: "/offline",
  },
  workboxOptions: {
    runtimeCaching: [
      {
        // API isteklerini asla cache'leme — streaming/SSE için kritik
        urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
      },
    ],
  },
})(nextConfig);
