import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const begin = "# BEGIN SalesKit Firecrawl setup";
const end = "# END SalesKit Firecrawl setup";
const appKeys = ["SOURCING_MODE", "CORE_AI_URL", "CORE_AI_API_KEY"];
const backendKeys = ["SOURCING_PROVIDER", "FIRECRAWL_API_KEY", "CORE_AI_API_KEY"];
const authKeys = ["BETTER_AUTH_SECRET", "CRON_SECRET"];
const forbiddenAppKeys = ["FIRECRAWL_API_KEY", "NEXT_PUBLIC_FIRECRAWL_API_KEY", "NEXT_PUBLIC_CORE_AI_API_KEY"];

class SetupError extends Error {}

function errorCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
    ? error.code : "IO_ERROR";
}

function validateKey(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._~+/-]{8,512}={0,2}$/.test(value)) {
    throw new SetupError(`${label} tidak valid. Gunakan token tanpa spasi atau baris baru.`);
  }
}

function assertNoExposedKeys(values, file) {
  if (forbiddenAppKeys.some((key) => Object.hasOwn(values, key))) {
    throw new SetupError(`${file}: key Firecrawl hanya boleh berada di core-ai; key antar-layanan tidak boleh memakai NEXT_PUBLIC_.`);
  }
}

async function readRegular(file, optional = false) {
  let stat;
  try {
    stat = await fs.lstat(file);
  } catch (error) {
    if (optional && errorCode(error) === "ENOENT") return undefined;
    throw error;
  }
  if (!stat.isFile()) throw new SetupError(`${file} harus berupa berkas biasa, bukan symlink.`);
  return { text: await fs.readFile(file, "utf8"), mode: stat.mode & 0o777 };
}

async function envTarget(dir) {
  const file = path.join(dir, ".env");
  const previous = await readRegular(file, true);
  const source = previous ?? await readRegular(path.join(dir, ".env.example"));
  return { file, previous, text: source.text, values: parseEnv(source.text) };
}

function withManagedBlock(text, updates, allowedKeys) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(begin);
  const finish = lines.indexOf(end);
  let managed = {};
  if (start !== -1 || finish !== -1) {
    if (start < 0 || finish <= start ||
        lines.filter((line) => line === begin).length !== 1 ||
        lines.filter((line) => line === end).length !== 1) {
      throw new SetupError("Struktur blok setup rusak. Periksa penanda BEGIN/END pada .env.");
    }
    managed = parseEnv(lines.slice(start + 1, finish).join(newline));
    for (const key of Object.keys(managed)) {
      if (!allowedKeys.includes(key)) {
        throw new SetupError(`Pindahkan ${key} ke luar blok setup agar tidak tertimpa.`);
      }
    }
    lines.splice(start, finish - start + 1);
  }
  const values = { ...managed, ...updates };
  const block = Object.keys(values).sort().map((key) => `${key}=${JSON.stringify(values[key])}`);
  const result = `${lines.join(newline).trimEnd()}${newline}${newline}${[
    begin, ...block, end, "",
  ].join(newline)}`;
  const parsed = parseEnv(result);
  for (const [key, value] of Object.entries(values)) {
    if (parsed[key] !== value) throw new SetupError(`Nilai ${key} tidak dapat dibaca. Periksa format .env.`);
  }
  for (const [key, value] of Object.entries(parseEnv(text))) {
    if (!(key in values) && parsed[key] !== value) {
      throw new SetupError(`Penulisan akan mengubah ${key}. Tidak ada konfigurasi yang disimpan.`);
    }
  }
  return result;
}

async function atomicWrite(file, text, mode = 0o600) {
  const temporary = `${file}.firecrawl-${randomBytes(8).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporary, text, { mode, flag: "wx" });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function saveTargets(targets) {
  const written = [];
  try {
    for (const target of targets) {
      await atomicWrite(target.file, target.updated);
      written.push(target);
    }
  } catch (error) {
    const failedRestores = [];
    for (const target of written.reverse()) {
      try {
        if (target.previous) {
          await atomicWrite(target.file, target.previous.text, target.previous.mode);
        } else {
          await fs.unlink(target.file);
        }
      } catch {
        failedRestores.push(target.file);
      }
    }
    if (failedRestores.length) {
      throw new SetupError(`Penulisan gagal (${errorCode(error)}); pemulihan juga gagal. Periksa: ${failedRestores.join(", ")}.`);
    }
    throw new SetupError(`Penulisan gagal (${errorCode(error)}); konfigurasi sebelumnya dipulihkan.`);
  }
}

/** @param {string} appDir @param {string} apiKey */
export async function configureFirecrawl(appDir, apiKey) {
  const key = apiKey.trim();
  validateKey(key, "Firecrawl API key");
  const inherited = [...new Set([...appKeys, ...backendKeys, ...forbiddenAppKeys, "PORT"])]
    .filter((name) => Object.hasOwn(process.env, name));
  if (inherited.length) {
    throw new SetupError(`Hapus override environment terminal dahulu: ${inherited.join(", ")}. Nilainya tidak ditampilkan.`);
  }
  const backendDir = path.resolve(appDir, "../core-ai");
  for (const [dir, name] of [[appDir, "sales-engineer-force"], [backendDir, "core-ai"]]) {
    const manifest = await readRegular(path.join(dir, "package.json"), true);
    if (!manifest || JSON.parse(manifest.text).name !== name) {
      throw new SetupError(`Checkout ${name} harus tersedia di ${dir}.`);
    }
  }
  const app = await envTarget(appDir);
  const backend = await envTarget(backendDir);
  assertNoExposedKeys(app.values, ".env aplikasi");
  for (const name of [".env.local", ".env.development.local", ".env.development",
    ".env.production.local", ".env.production"]) {
    const override = await readRegular(path.join(appDir, name), true);
    if (!override) continue;
    const values = parseEnv(override.text);
    assertNoExposedKeys(values, name);
    const conflicts = appKeys.filter((key) => Object.hasOwn(values, key));
    if (conflicts.length) {
      throw new SetupError(`${name} menimpa ${conflicts.join(", ")}. Satukan konfigurasi tersebut ke .env dahulu.`);
    }
  }
  if (app.values.CORE_AI_URL) {
    let url;
    try { url = new URL(app.values.CORE_AI_URL); } catch {
      throw new SetupError("CORE_AI_URL tidak valid. Skrip ini hanya untuk backend lokal.");
    }
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new SetupError("CORE_AI_URL bukan backend lokal. Konfigurasi remote tidak diubah oleh skrip ini.");
    }
  }
  const port = backend.values.PORT ?? "8787";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new SetupError("PORT core-ai harus berupa angka 1-65535.");
  }
  const a = app.values.CORE_AI_API_KEY;
  const b = backend.values.CORE_AI_API_KEY;
  if (a && b && a !== b) {
    throw new SetupError("CORE_AI_API_KEY kedua layanan berbeda. Samakan konfigurasi yang ada dahulu.");
  }
  const shared = b || a || randomBytes(32).toString("hex");
  validateKey(shared, "CORE_AI_API_KEY");
  if (shared === key) {
    throw new SetupError("CORE_AI_API_KEY tidak boleh sama dengan API key Firecrawl.");
  }
  const backendUrl = `http://127.0.0.1:${Number(port)}`;
  const appUpdates = {
    SOURCING_MODE: "live", CORE_AI_URL: backendUrl, CORE_AI_API_KEY: shared,
    ...(!app.previous ? {
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      CRON_SECRET: randomBytes(32).toString("hex"),
    } : {}),
  };
  app.updated = withManagedBlock(app.text, appUpdates, [...appKeys, ...authKeys]);
  backend.updated = withManagedBlock(backend.text, {
    SOURCING_PROVIDER: "firecrawl", FIRECRAWL_API_KEY: key, CORE_AI_API_KEY: shared,
  }, backendKeys);
  await saveTargets([backend, app]);
  return { appEnvFile: app.file, backendEnvFile: backend.file, backendUrl };
}

async function hiddenKey() {
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const readline = createInterface({ input: process.stdin, output, terminal: true });
  const controller = new AbortController();
  readline.once("SIGINT", () => controller.abort());
  readline.once("close", () => controller.abort());
  process.stdout.write("Firecrawl API key (input tersembunyi, Ctrl+C untuk batal): ");
  try {
    return await readline.question("", { signal: controller.signal });
  } finally {
    readline.close();
    process.stdout.write("\n");
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("pnpm setup:firecrawl\nMasukkan key pada prompt tersembunyi, bukan argumen CLI.\nMenyiapkan .env SalesKit dan ../core-ai untuk penggunaan lokal; tanpa akses Cloud atau menjalankan server.");
    return;
  }
  if (args.length) throw new SetupError("Jalankan tanpa argumen. API key hanya dimasukkan pada prompt tersembunyi.");
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new SetupError("Jalankan pnpm setup:firecrawl dari terminal interaktif, bukan pipe atau log capture.");
  }
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  console.log("Setup lokal SalesKit + core-ai. Konfigurasi lain dipertahankan; tidak ada panggilan berbayar.");
  const result = await configureFirecrawl(appDir, await hiddenKey());
  console.log(`Konfigurasi tersimpan dengan izin 0600:\n${result.backendEnvFile}\n${result.appEnvFile}`);
  console.log("Key belum divalidasi ke Firecrawl Cloud. Tidak ada kredit yang digunakan.");
  console.log("Dari folder SalesKit, jalankan/restart pada dua terminal:\n  pnpm dev:ai\n  pnpm dev");
  console.log("Jika database lokal belum disiapkan, ikuti langkah demo lokal di README terlebih dahulu.");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    if (error?.name === "AbortError") {
      console.error("Setup dibatalkan; tidak ada konfigurasi yang ditulis.");
      process.exitCode = 130;
    } else {
      console.error(error instanceof SetupError ? error.message : `Setup gagal (${errorCode(error)}). Periksa berkas dan izin folder.`);
      process.exitCode = 1;
    }
  });
}
