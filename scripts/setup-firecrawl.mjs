import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const begin = "# BEGIN SalesKit Firecrawl setup";
const end = "# END SalesKit Firecrawl setup";
const appKeys = ["SOURCING_MODE", "SOURCING_LIVE_PROVIDER", "CORE_AI_URL", "CORE_AI_API_KEY"];
const backendKeys = [
  "SOURCING_PROVIDER", "FIRECRAWL_API_KEY", "CORE_AI_API_KEY", "SEARXNG_URL",
  "SOURCING_BROWSER_URL", "SOURCING_BROWSER_ENGINE", "SOURCING_BROWSER_API_KEY", "SEARXNG_SECRET",
];
const authKeys = ["BETTER_AUTH_SECRET", "CRON_SECRET"];
const forbiddenAppKeys = [
  "FIRECRAWL_API_KEY", "SOURCING_BROWSER_API_KEY", "SEARXNG_SECRET", "NEXT_PUBLIC_FIRECRAWL_API_KEY",
  "NEXT_PUBLIC_CORE_AI_API_KEY", "NEXT_PUBLIC_SOURCING_BROWSER_API_KEY", "NEXT_PUBLIC_SEARXNG_SECRET",
];

export class SetupError extends Error {}

export function errorCode(error) {
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
    throw new SetupError(`${file}: key provider hanya boleh berada di core-ai; key antar-layanan tidak boleh memakai NEXT_PUBLIC_.`);
  }
}

function assertLocalUrl(value, label) {
  if (!value) return;
  let url;
  try { url = new URL(value); } catch {
    throw new SetupError(`${label} tidak valid. Skrip ini hanya untuk layanan lokal.`);
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new SetupError(`${label} bukan layanan lokal. Konfigurasi remote tidak diubah oleh skrip ini.`);
  }
}

function privateLocalKey(value, label) {
  if (!value) return randomBytes(32).toString("hex");
  validateKey(value, label);
  if (value.replace(/={1,2}$/, "").length < 32 || /change-?me|replace-?me|ganti-dengan|placeholder/i.test(value)) {
    throw new SetupError(`${label} harus berupa token privat minimal 32 karakter, bukan placeholder.`);
  }
  return value;
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
  return configureLocalSourcing(appDir, "firecrawl", key);
}

/** @param {string} appDir */
export async function configureSelfhost(appDir) {
  return configureLocalSourcing(appDir, "selfhost");
}

/** @param {string} appDir @param {"firecrawl" | "selfhost"} provider @param {string} [key] */
async function configureLocalSourcing(appDir, provider, key) {
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
  assertLocalUrl(app.values.CORE_AI_URL, "CORE_AI_URL");
  const port = backend.values.PORT ?? "8787";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new SetupError("PORT core-ai harus berupa angka 1-65535.");
  }
  if (provider === "selfhost" && Number(port) !== 8787) {
    throw new SetupError("PORT core-ai harus 8787 untuk setup selfhost lokal. Port yang ada tidak diubah.");
  }
  const a = app.values.CORE_AI_API_KEY;
  const b = backend.values.CORE_AI_API_KEY;
  if (a && b && a !== b) {
    throw new SetupError("CORE_AI_API_KEY kedua layanan berbeda. Samakan konfigurasi yang ada dahulu.");
  }
  const shared = b || a || randomBytes(32).toString("hex");
  validateKey(shared, "CORE_AI_API_KEY");
  if ([key, backend.values.FIRECRAWL_API_KEY].includes(shared)) {
    throw new SetupError("CORE_AI_API_KEY tidak boleh sama dengan API key Firecrawl.");
  }
  for (const name of ["SOURCING_BROWSER_API_KEY", "SEARXNG_SECRET"]) {
    if (shared === backend.values[name]) {
      throw new SetupError(`CORE_AI_API_KEY tidak boleh sama dengan ${name}.`);
    }
    if (key && key === backend.values[name]) {
      throw new SetupError(`FIRECRAWL_API_KEY tidak boleh sama dengan ${name}.`);
    }
  }
  const browserEngine = backend.values.SOURCING_BROWSER_ENGINE ?? "crawl4ai";
  let localUpdates = {};
  if (provider === "selfhost") {
    if (browserEngine !== "crawl4ai" && browserEngine !== "browser-use") {
      throw new SetupError("SOURCING_BROWSER_ENGINE harus crawl4ai atau browser-use. Nilai yang ada tidak diubah.");
    }
    assertLocalUrl(backend.values.SEARXNG_URL, "SEARXNG_URL");
    assertLocalUrl(backend.values.SOURCING_BROWSER_URL, "SOURCING_BROWSER_URL");
    const browserKey = privateLocalKey(backend.values.SOURCING_BROWSER_API_KEY, "SOURCING_BROWSER_API_KEY");
    const searxngSecret = privateLocalKey(backend.values.SEARXNG_SECRET, "SEARXNG_SECRET");
    if ([browserKey, searxngSecret].includes(backend.values.FIRECRAWL_API_KEY)) {
      throw new SetupError("SOURCING_BROWSER_API_KEY/SEARXNG_SECRET tidak boleh sama dengan FIRECRAWL_API_KEY.");
    }
    if (browserKey === searxngSecret) {
      throw new SetupError("SOURCING_BROWSER_API_KEY dan SEARXNG_SECRET harus berbeda.");
    }
    localUpdates = {
      SEARXNG_URL: "http://127.0.0.1:18888", SOURCING_BROWSER_URL: "http://127.0.0.1:18889",
      SOURCING_BROWSER_ENGINE: browserEngine, SOURCING_BROWSER_API_KEY: browserKey, SEARXNG_SECRET: searxngSecret,
    };
  }
  const backendUrl = `http://127.0.0.1:${Number(port)}`;
  const appUpdates = {
    SOURCING_MODE: "live", SOURCING_LIVE_PROVIDER: provider, CORE_AI_URL: backendUrl, CORE_AI_API_KEY: shared,
    ...(!app.previous ? {
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      CRON_SECRET: randomBytes(32).toString("hex"),
    } : {}),
  };
  app.updated = withManagedBlock(app.text, appUpdates, [...appKeys, ...authKeys]);
  backend.updated = withManagedBlock(backend.text, {
    SOURCING_PROVIDER: provider, CORE_AI_API_KEY: shared,
    ...(provider === "firecrawl" ? { FIRECRAWL_API_KEY: key } : localUpdates),
  }, backendKeys);
  await saveTargets([backend, app]);
  return {
    appEnvFile: app.file, backendEnvFile: backend.file, backendUrl,
    ...(provider === "selfhost" ? { browserEngine } : {}),
  };
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
