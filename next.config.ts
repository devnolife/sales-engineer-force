import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deploy produksi via Docker (M7): server mandiri minimal di .next/standalone
  output: "standalone",
  experimental: {
    serverActions: {
      // Upload inquiry maks 5 MB (gambar/PDF scan) + overhead multipart.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
