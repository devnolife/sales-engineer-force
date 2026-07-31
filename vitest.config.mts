import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test unit murni (math, terbilang, nomor, status) berjalan di Node.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
