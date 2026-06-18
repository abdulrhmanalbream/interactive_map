import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // أبقِ وحدة libSQL الأصلية (native) خارج حزمة الـ bundle لتعمل على Vercel/serverless
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
