import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deploy produksi via Docker (M7): server mandiri minimal di .next/standalone
  output: "standalone",
};

export default nextConfig;
