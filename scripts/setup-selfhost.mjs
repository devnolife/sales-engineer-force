import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { configureSelfhost, errorCode, SetupError } from "./setup-firecrawl.mjs";

export { configureSelfhost };

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("pnpm setup:selfhost\nTanpa input, API key Cloud, atau model. Menyiapkan .env SalesKit dan ../core-ai untuk SearXNG + browser lokal (default crawl4ai; pilihan valid yang ada dipertahankan); tidak menjalankan Docker/server atau mengakses jaringan.");
    return;
  }
  if (args.length) throw new SetupError("Jalankan pnpm setup:selfhost tanpa argumen. Jangan memasukkan key pada CLI.");
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  console.log("Setup sourcing selfhost lokal: SearXNG + browser lokal. Tidak ada panggilan Firecrawl; resource server tetap digunakan.");
  const result = await configureSelfhost(appDir);
  console.log(`Konfigurasi tersimpan dengan izin 0600:\n${result.backendEnvFile}\n${result.appEnvFile}`);
  console.log(`Engine browser: ${result.browserEngine}`);
  console.log("Tidak ada paket, Docker, layanan, model, atau database yang diubah/dijalankan oleh setup.");
  console.log("Dari folder SalesKit, jalankan stack lokal secara terpisah:\n  (cd ../core-ai && docker compose -p saleskit-sourcing-local -f docker-compose.sourcing.yml up -d --build)");
  console.log("Lalu jalankan/restart pada dua terminal:\n  pnpm dev:ai\n  pnpm dev");
  console.log("Browser Use opsional: ubah SOURCING_BROWSER_ENGINE=browser-use pada blok setup di ../core-ai/.env, lalu restart core-ai. Lihat README untuk batasan resource dan scraping.");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof SetupError ? error.message : `Setup gagal (${errorCode(error)}). Periksa berkas dan izin folder.`);
    process.exitCode = 1;
  });
}
