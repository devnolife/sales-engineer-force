import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as setup from "./setup-firecrawl.mjs";
import { configureSelfhost } from "./setup-selfhost.mjs";

const roots: string[] = [];
const appRoot = fileURLToPath(new URL("..", import.meta.url));
const cloudKey = "fc-synthetic-unused-cloud-key";
const browserKey = "synthetic-private-browser-token-for-tests";
const searxngSecret = "synthetic-private-searxng-secret-for-tests";
const sharedKey = "synthetic-private-core-ai-token-for-tests";
const begin = "# BEGIN SalesKit Firecrawl setup";
const end = "# END SalesKit Firecrawl setup";

async function fixture(appEnv?: string, backendEnv?: string) {
  const root = path.join(appRoot, ".data", `selfhost-setup-fixture-${randomUUID()}`);
  roots.push(root);
  const app = path.join(root, "sales-engineer-force");
  const backend = path.join(root, "core-ai");
  await fs.mkdir(path.join(app, "scripts"), { recursive: true });
  await fs.mkdir(backend);
  await fs.writeFile(path.join(app, "package.json"), '{"name":"sales-engineer-force"}');
  await fs.writeFile(path.join(backend, "package.json"), '{"name":"core-ai"}');
  await fs.writeFile(path.join(app, ".env.example"), [
    "# Keep app settings", 'DATABASE_URL="file:./dev.db"',
    "BETTER_AUTH_SECRET=replace-auth", "CRON_SECRET=replace-cron",
    "SOURCING_MODE=mock", "SOURCING_LIVE_PROVIDER=firecrawl",
    "CORE_AI_URL=http://localhost:8787", "CORE_AI_API_KEY=",
    "SOURCING_MARGIN_PERCENT=30", "",
  ].join("\n"));
  await fs.writeFile(path.join(backend, ".env.example"), [
    "PORT=8787", "AI_PROVIDER=mock", "SOURCING_PROVIDER=firecrawl",
    "FIRECRAWL_API_KEY=", "SOURCING_BROWSER_API_KEY=", "SEARXNG_SECRET=", "",
  ].join("\n"));
  if (appEnv !== undefined) await fs.writeFile(path.join(app, ".env"), appEnv);
  if (backendEnv !== undefined) await fs.writeFile(path.join(backend, ".env"), backendEnv);
  return { root, app, backend };
}

async function env(dir: string) {
  return parseEnv(await fs.readFile(path.join(dir, ".env"), "utf8"));
}

async function absent(dir: string) {
  await expect(fs.stat(path.join(dir, ".env"))).rejects.toMatchObject({ code: "ENOENT" });
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe("selfhost local setup", () => {
  it("registers a no-input terminal command", async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(appRoot, "package.json"), "utf8"));
    expect(manifest.scripts["setup:selfhost"]).toBe("node scripts/setup-selfhost.mjs");
  });

  it("keeps example/demo and production installs on their existing defaults unless explicitly switched", async () => {
    expect(parseEnv(await fs.readFile(path.join(appRoot, ".env.example"), "utf8"))).toMatchObject({
      SOURCING_MODE: "mock", SOURCING_LIVE_PROVIDER: "firecrawl",
    });
    const compose = await fs.readFile(path.join(appRoot, "docker-compose.prod.yml"), "utf8");
    expect(compose).toContain('SOURCING_LIVE_PROVIDER: "${SOURCING_LIVE_PROVIDER-firecrawl}"');
    expect(compose).not.toContain("SOURCING_LIVE_PROVIDER:-");
  });

  it("sets only local sourcing endpoints and private distinct secrets without a Cloud key or model", async () => {
    const { app, backend } = await fixture();
    const fetch = vi.fn(() => { throw new Error("Setup must not access a network"); });
    vi.stubGlobal("fetch", fetch);
    expect(await configureSelfhost(app)).toMatchObject({ backendUrl: "http://127.0.0.1:8787" });
    const a = await env(app);
    const b = await env(backend);
    expect(a).toMatchObject({
      SOURCING_MODE: "live", SOURCING_LIVE_PROVIDER: "selfhost",
      CORE_AI_URL: "http://127.0.0.1:8787", DATABASE_URL: "file:./dev.db",
      SOURCING_MARGIN_PERCENT: "30",
    });
    expect(b).toMatchObject({
      SOURCING_PROVIDER: "selfhost", SEARXNG_URL: "http://127.0.0.1:18888",
      SOURCING_BROWSER_URL: "http://127.0.0.1:18889", SOURCING_BROWSER_ENGINE: "crawl4ai",
      AI_PROVIDER: "mock", FIRECRAWL_API_KEY: "",
    });
    expect(a.CORE_AI_API_KEY).toBe(b.CORE_AI_API_KEY);
    for (const key of ["CORE_AI_API_KEY", "SOURCING_BROWSER_API_KEY", "SEARXNG_SECRET"]) {
      expect(b[key]).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(new Set([b.CORE_AI_API_KEY, b.SOURCING_BROWSER_API_KEY, b.SEARXNG_SECRET]).size).toBe(3);
    for (const key of ["FIRECRAWL_API_KEY", "SOURCING_BROWSER_API_KEY", "SEARXNG_SECRET"]) {
      expect(a[key]).toBeUndefined();
    }
    expect(a.BETTER_AUTH_SECRET).toMatch(/^[a-f0-9]{64}$/);
    expect(a.CRON_SECRET).toMatch(/^[a-f0-9]{64}$/);
    for (const dir of [app, backend]) {
      expect((await fs.stat(path.join(dir, ".env"))).mode & 0o777).toBe(0o600);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is byte-idempotent and reuses existing safe browser, SearXNG and shared secrets", async () => {
    const { app, backend } = await fixture(undefined, [
      `CORE_AI_API_KEY=${sharedKey}`, `SOURCING_BROWSER_API_KEY=${browserKey}`,
      `SEARXNG_SECRET=${searxngSecret}`, `FIRECRAWL_API_KEY=${cloudKey}`, "",
    ].join("\n"));
    await configureSelfhost(app);
    const before = await Promise.all([app, backend].map((dir) => fs.readFile(path.join(dir, ".env"), "utf8")));
    await configureSelfhost(app);
    expect(await Promise.all([app, backend].map((dir) => fs.readFile(path.join(dir, ".env"), "utf8")))).toEqual(before);
    expect(await env(backend)).toMatchObject({
      CORE_AI_API_KEY: sharedKey, SOURCING_BROWSER_API_KEY: browserKey,
      SEARXNG_SECRET: searxngSecret, FIRECRAWL_API_KEY: cloudKey,
    });
    expect(before[0]).not.toContain(cloudKey);
    expect(before[0]).not.toContain(browserKey);
    expect(before[0]).not.toContain(searxngSecret);
  });

  it.each(["crawl4ai", "browser-use"])("preserves an existing valid %s browser engine", async (browserEngine) => {
    const { app, backend } = await fixture(undefined, `SOURCING_BROWSER_ENGINE=${browserEngine}\n`);
    const result = await configureSelfhost(app);
    expect((await env(backend)).SOURCING_BROWSER_ENGINE).toBe(browserEngine);
    expect(result).toMatchObject({ browserEngine });
  });

  it("keeps a deliberate browser-use choice byte-idempotent on subsequent setup runs", async () => {
    const { app, backend } = await fixture();
    await configureSelfhost(app);
    const appBefore = await fs.readFile(path.join(app, ".env"), "utf8");
    const changed = (await fs.readFile(path.join(backend, ".env"), "utf8"))
      .replace('SOURCING_BROWSER_ENGINE="crawl4ai"', 'SOURCING_BROWSER_ENGINE="browser-use"');
    await fs.writeFile(path.join(backend, ".env"), changed);
    await configureSelfhost(app);
    expect((await env(backend)).SOURCING_BROWSER_ENGINE).toBe("browser-use");
    expect(await fs.readFile(path.join(app, ".env"), "utf8")).toBe(appBefore);
    expect(await fs.readFile(path.join(backend, ".env"), "utf8")).toBe(changed);
  });

  it.each(["", "invalid", "Browser-Use", "browser-use-llm"])(
    "rejects invalid configured browser engine %j without rewriting the user's files", async (browserEngine) => {
      const originalApp = "APP_KEEP=1\n";
      const originalBackend = `SOURCING_BROWSER_ENGINE=${JSON.stringify(browserEngine)}\n`;
      const { app, backend } = await fixture(originalApp, originalBackend);
      await expect(configureSelfhost(app)).rejects.toThrow(/SOURCING_BROWSER_ENGINE/);
      expect(await fs.readFile(path.join(app, ".env"), "utf8")).toBe(originalApp);
      expect(await fs.readFile(path.join(backend, ".env"), "utf8")).toBe(originalBackend);
    },
  );

  it("loads effective selfhost settings through the real Next.js and backend Node env loaders", async () => {
    const { app, backend } = await fixture();
    await configureSelfhost(app);
    const nextRequire = createRequire(createRequire(import.meta.url).resolve("next/package.json"));
    const next = spawnSync(process.execPath, ["-e", `
      require(process.argv[1]).loadEnvConfig(process.argv[2], true);
      console.log(JSON.stringify({
        mode: process.env.SOURCING_MODE, provider: process.env.SOURCING_LIVE_PROVIDER,
        url: process.env.CORE_AI_URL, cloud: process.env.FIRECRAWL_API_KEY,
        browser: process.env.SOURCING_BROWSER_API_KEY, searxng: process.env.SEARXNG_SECRET
      }));
    `, nextRequire.resolve("@next/env"), app], {
      encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "development" },
    });
    expect(next.status).toBe(0);
    expect(JSON.parse(next.stdout)).toEqual({
      mode: "live", provider: "selfhost", url: "http://127.0.0.1:8787",
    });
    const core = spawnSync(process.execPath, [`--env-file=${path.join(backend, ".env")}`, "-e", `
      console.log(JSON.stringify({
        provider: process.env.SOURCING_PROVIDER, browser: process.env.SOURCING_BROWSER_ENGINE,
        search: process.env.SEARXNG_URL, detail: process.env.SOURCING_BROWSER_URL
      }));
    `], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" } });
    expect(core.status).toBe(0);
    expect(JSON.parse(core.stdout)).toEqual({
      provider: "selfhost", browser: "crawl4ai",
      search: "http://127.0.0.1:18888", detail: "http://127.0.0.1:18889",
    });
  });

  it("preserves comments, CRLF, multiline values, auth, database, margin and unrelated AI settings", async () => {
    const { app, backend } = await fixture(
      '# Keep app\r\nDATABASE_URL="file:./existing.db"\r\nBETTER_AUTH_SECRET=existing-auth\r\nCRON_SECRET=existing-cron\r\nSOURCING_MARGIN_PERCENT=25\r\nEXTRA="first\r\nsecond"\r\n',
      `# Keep backend\r\nPORT=8787\r\nAI_PROVIDER=ollama\r\nOLLAMA_MODEL=already-configured\r\nFIRECRAWL_API_KEY=${cloudKey}\r\n`,
    );
    await configureSelfhost(app);
    expect(await env(app)).toMatchObject({
      DATABASE_URL: "file:./existing.db", BETTER_AUTH_SECRET: "existing-auth",
      CRON_SECRET: "existing-cron", SOURCING_MARGIN_PERCENT: "25", EXTRA: "first\nsecond",
    });
    expect(await env(backend)).toMatchObject({
      PORT: "8787", AI_PROVIDER: "ollama", OLLAMA_MODEL: "already-configured", FIRECRAWL_API_KEY: cloudKey,
    });
    expect(await fs.readFile(path.join(app, ".env"), "utf8")).toContain("# Keep app\r\n");
  });

  it.each(["app", "backend"])("reuses an existing shared service key from %s", async (owner) => {
    const value = `CORE_AI_API_KEY=${sharedKey}\n`;
    const { app, backend } = await fixture(owner === "app" ? value : undefined, owner === "backend" ? value : undefined);
    await configureSelfhost(app);
    expect((await env(app)).CORE_AI_API_KEY).toBe(sharedKey);
    expect((await env(backend)).CORE_AI_API_KEY).toBe(sharedKey);
  });

  it("switches an existing Firecrawl managed block to selfhost and back without deleting either provider's secrets", async () => {
    const { app, backend } = await fixture();
    await setup.configureFirecrawl(app, cloudKey);
    const shared = (await env(app)).CORE_AI_API_KEY;
    await configureSelfhost(app);
    const selfhost = await env(backend);
    expect(await env(app)).toMatchObject({ SOURCING_LIVE_PROVIDER: "selfhost", CORE_AI_API_KEY: shared });
    expect(selfhost).toMatchObject({ SOURCING_PROVIDER: "selfhost", FIRECRAWL_API_KEY: cloudKey });
    await setup.configureFirecrawl(app, "fc-synthetic-deliberate-return-to-cloud");
    expect(await env(app)).toMatchObject({ SOURCING_LIVE_PROVIDER: "firecrawl", CORE_AI_API_KEY: shared });
    expect(await env(backend)).toMatchObject({
      SOURCING_PROVIDER: "firecrawl", FIRECRAWL_API_KEY: "fc-synthetic-deliberate-return-to-cloud",
      SOURCING_BROWSER_API_KEY: selfhost.SOURCING_BROWSER_API_KEY, SEARXNG_SECRET: selfhost.SEARXNG_SECRET,
    });
    await configureSelfhost(app);
    expect((await env(backend)).SOURCING_BROWSER_API_KEY).toBe(selfhost.SOURCING_BROWSER_API_KEY);
    for (const dir of [app, backend]) {
      expect((await fs.readFile(path.join(dir, ".env"), "utf8")).split(begin)).toHaveLength(2);
    }
  });

  it.each(["SOURCING_BROWSER_API_KEY", "SEARXNG_SECRET"])(
    "rejects a Cloud switchback using the preserved %s without writing files", async (name) => {
      const { app, backend } = await fixture();
      await configureSelfhost(app);
      const local = await env(backend);
      const key = local[name];
      if (!key) throw new Error(`Expected generated ${name} in the fixture`);
      const before = await Promise.all([app, backend].map((dir) => fs.readFile(path.join(dir, ".env"), "utf8")));
      const write = vi.spyOn(fs, "writeFile");
      const rename = vi.spyOn(fs, "rename");
      await expect(setup.configureFirecrawl(app, key)).rejects.toThrow(name);
      expect(write).not.toHaveBeenCalled();
      expect(rename).not.toHaveBeenCalled();
      expect(await Promise.all([app, backend].map((dir) => fs.readFile(path.join(dir, ".env"), "utf8"))))
        .toEqual(before);
    },
  );

  it.each(["SOURCING_BROWSER_API_KEY", "SEARXNG_SECRET"])("rejects unsafe existing %s without changing files", async (name) => {
    const original = `${name}=change-me\n`;
    const { app, backend } = await fixture(undefined, original);
    await expect(configureSelfhost(app)).rejects.toThrow(name);
    await absent(app);
    expect(await fs.readFile(path.join(backend, ".env"), "utf8")).toBe(original);
  });

  it.each([30, 31])("rejects a padded private token with only %s token characters", async (length) => {
    const value = `${"a".repeat(length)}${"=".repeat(32 - length)}`;
    const original = `SOURCING_BROWSER_API_KEY=${value}\n`;
    const { app, backend } = await fixture(undefined, original);
    await expect(configureSelfhost(app)).rejects.toThrow(/SOURCING_BROWSER_API_KEY/);
    await absent(app);
    expect(await fs.readFile(path.join(backend, ".env"), "utf8")).toBe(original);
  });

  it.each([32, 512])("preserves a valid %s-character Bearer token plus optional padding", async (length) => {
    const value = `${"Ab0._~+/-".repeat(57).slice(0, length)}==`;
    const { app, backend } = await fixture(undefined, `SOURCING_BROWSER_API_KEY=${value}\n`);
    await configureSelfhost(app);
    expect((await env(backend)).SOURCING_BROWSER_API_KEY).toBe(value);
    await configureSelfhost(app);
    expect((await env(backend)).SOURCING_BROWSER_API_KEY).toBe(value);
  });

  it.each(["SOURCING_BROWSER_API_KEY", "SEARXNG_SECRET", "FIRECRAWL_API_KEY"])(
    "never copies the backend %s secret into Next.js by reusing it as a shared key", async (name) => {
      const original = `${name}=${sharedKey}\nCORE_AI_API_KEY=${sharedKey}\n`;
      const { app, backend } = await fixture(undefined, original);
      await expect(configureSelfhost(app)).rejects.toThrow(/sama|berbeda/);
      await absent(app);
      expect(await fs.readFile(path.join(backend, ".env"), "utf8")).toBe(original);
    },
  );

  it("requires separate private keys for browser and SearXNG", async () => {
    const original = `SOURCING_BROWSER_API_KEY=${browserKey}\nSEARXNG_SECRET=${browserKey}\n`;
    const { app, backend } = await fixture(undefined, original);
    await expect(configureSelfhost(app)).rejects.toThrow(/sama|berbeda/);
    await absent(app);
    expect(await fs.readFile(path.join(backend, ".env"), "utf8")).toBe(original);
  });

  it.each(["SOURCING_BROWSER_API_KEY", "SEARXNG_SECRET"])(
    "never forwards an existing Cloud secret through %s", async (name) => {
      const preservedCloudKey = "fc-synthetic-preserved-cloud-secret-not-for-local-services";
      const originalApp = "APP_KEEP=1\n";
      const originalBackend = `FIRECRAWL_API_KEY=${preservedCloudKey}\n${name}=${preservedCloudKey}\n`;
      const { app, backend } = await fixture(originalApp, originalBackend);
      await expect(configureSelfhost(app)).rejects.toThrow(/FIRECRAWL_API_KEY/);
      expect(await fs.readFile(path.join(app, ".env"), "utf8")).toBe(originalApp);
      expect(await fs.readFile(path.join(backend, ".env"), "utf8")).toBe(originalBackend);
    },
  );

  it("rejects mismatched existing shared keys rather than rotating user configuration", async () => {
    const original = `CORE_AI_API_KEY=${sharedKey}\n`;
    const { app, backend } = await fixture(original, `CORE_AI_API_KEY=${browserKey}\n`);
    await expect(configureSelfhost(app)).rejects.toThrow(/berbeda/);
    expect(await fs.readFile(path.join(app, ".env"), "utf8")).toBe(original);
    expect((await env(backend)).CORE_AI_API_KEY).toBe(browserKey);
  });

  it.each([
    "SOURCING_LIVE_PROVIDER", "SOURCING_MODE", "SOURCING_PROVIDER", "CORE_AI_URL", "CORE_AI_API_KEY",
    "SEARXNG_URL", "SOURCING_BROWSER_URL", "SOURCING_BROWSER_ENGINE", "SOURCING_BROWSER_API_KEY",
    "SEARXNG_SECRET", "FIRECRAWL_API_KEY", "PORT",
  ])("rejects inherited %s overrides without revealing values", async (name) => {
    const { app, backend } = await fixture();
    const value = "synthetic-inherited-secret-do-not-print";
    vi.stubEnv(name, value);
    const failure = await configureSelfhost(app).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(name);
    expect((failure as Error).message).not.toContain(value);
    await absent(app);
    await absent(backend);
  });

  it.each([".env.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"])(
    "rejects a live-provider override in %s", async (name) => {
      const { app, backend } = await fixture();
      await fs.writeFile(path.join(app, name), "SOURCING_LIVE_PROVIDER=firecrawl\n");
      await expect(configureSelfhost(app)).rejects.toThrow(name);
      await absent(app);
      await absent(backend);
    },
  );

  it.each([
    "SOURCING_BROWSER_API_KEY", "SEARXNG_SECRET", "NEXT_PUBLIC_SOURCING_BROWSER_API_KEY",
    "NEXT_PUBLIC_SEARXNG_SECRET", "FIRECRAWL_API_KEY", "NEXT_PUBLIC_CORE_AI_API_KEY",
  ])("rejects backend/private %s keys anywhere in application env files", async (name) => {
    const { app, backend } = await fixture(`${name}=${browserKey}\n`);
    await expect(configureSelfhost(app)).rejects.toThrow(/core-ai|NEXT_PUBLIC/);
    await fs.unlink(path.join(app, ".env"));
    await fs.writeFile(path.join(app, ".env.local"), `${name}=${browserKey}\n`);
    await expect(configureSelfhost(app)).rejects.toThrow(/core-ai|NEXT_PUBLIC/);
    await absent(app);
    await absent(backend);
  });

  it.each(["CORE_AI_URL", "SEARXNG_URL", "SOURCING_BROWSER_URL"])(
    "refuses to overwrite an existing remote %s with local configuration", async (name) => {
      const original = `${name}=https://remote.example\n`;
      const { app, backend } = await fixture(name === "CORE_AI_URL" ? original : undefined,
        name === "CORE_AI_URL" ? undefined : original);
      await expect(configureSelfhost(app)).rejects.toThrow(/lokal/);
      const configured = name === "CORE_AI_URL" ? app : backend;
      const untouched = name === "CORE_AI_URL" ? backend : app;
      expect(await fs.readFile(path.join(configured, ".env"), "utf8")).toBe(original);
      await absent(untouched);
    },
  );

  it("refuses a non-default backend port rather than writing a wrong local endpoint", async () => {
    const { app, backend } = await fixture(undefined, "PORT=18900\n");
    await expect(configureSelfhost(app)).rejects.toThrow(/PORT.*8787/);
    await absent(app);
    expect((await env(backend)).PORT).toBe("18900");
  });

  it.each(["app", "backend"])("rejects the %s env symlink without changing its target", async (owner) => {
    const { root, app, backend } = await fixture();
    const target = path.join(root, "protected.env");
    await fs.writeFile(target, "KEEP=unchanged\n");
    await fs.symlink(target, path.join(owner === "app" ? app : backend, ".env"));
    await expect(configureSelfhost(app)).rejects.toThrow(/berkas biasa/);
    expect(await fs.readFile(target, "utf8")).toBe("KEEP=unchanged\n");
    await absent(owner === "app" ? backend : app);
  });

  it("rejects malformed or unknown managed settings instead of deleting them", async () => {
    const { app, backend } = await fixture(`${begin}\nKEEP=1\n`);
    await expect(configureSelfhost(app)).rejects.toThrow(/blok/);
    await fs.writeFile(path.join(app, ".env"), `${begin}\nKEEP=1\n${end}\n`);
    await expect(configureSelfhost(app)).rejects.toThrow(/KEEP/);
    expect((await env(app)).KEEP).toBe("1");
    await absent(backend);
  });

  it.each([true, false])("rolls back a failed application write with previous backend=%s", async (existing) => {
    const { app, backend } = await fixture("APP_KEEP=1\n", existing ? "BACKEND_KEEP=2\n" : undefined);
    if (existing) await fs.chmod(path.join(backend, ".env"), 0o640);
    const rename = fs.rename.bind(fs);
    let failed = false;
    vi.spyOn(fs, "rename").mockImplementation(async (source, target) => {
      if (String(target) === path.join(app, ".env") && !failed) {
        failed = true;
        throw Object.assign(new Error("synthetic failure"), { code: "EACCES" });
      }
      return rename(source, target);
    });
    await expect(configureSelfhost(app)).rejects.toThrow(/dipulihkan/);
    expect(await fs.readFile(path.join(app, ".env"), "utf8")).toBe("APP_KEEP=1\n");
    if (existing) {
      expect(await fs.readFile(path.join(backend, ".env"), "utf8")).toBe("BACKEND_KEEP=2\n");
      expect((await fs.stat(path.join(backend, ".env"))).mode & 0o777).toBe(0o640);
    } else await absent(backend);
    for (const dir of [app, backend]) {
      expect((await fs.readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    }
  });

  it("requires the sibling backend checkout before writing", async () => {
    const { app, backend } = await fixture();
    await fs.unlink(path.join(backend, "package.json"));
    await expect(configureSelfhost(app)).rejects.toThrow(/core-ai/);
    await absent(app);
    await absent(backend);
  });

  it.each([undefined, "browser-use"])("runs without a TTY/input and reports the actual engine with existing=%s", async (browserEngine) => {
    const { app, backend } = await fixture(undefined,
      browserEngine ? `SOURCING_BROWSER_ENGINE=${browserEngine}\n` : undefined);
    const source = path.join(appRoot, "scripts/setup-selfhost.mjs");
    expect(await fs.stat(source).then(() => true, () => false)).toBe(true);
    for (const name of ["setup-firecrawl.mjs", "setup-selfhost.mjs"]) {
      await fs.copyFile(path.join(appRoot, "scripts", name), path.join(app, "scripts", name));
    }
    const target = path.join(app, "scripts/setup-selfhost.mjs");
    const run = (...args: string[]) => spawnSync(process.execPath, [target, ...args], {
      encoding: "utf8", input: "", env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" },
    });
    const help = run("--help");
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("setup:selfhost");
    const unsafe = run(cloudKey);
    expect(unsafe.status).toBe(1);
    expect(`${unsafe.stdout}${unsafe.stderr}`).not.toContain(cloudKey);
    await absent(app);
    if (browserEngine) expect(await env(backend)).toEqual({ SOURCING_BROWSER_ENGINE: browserEngine });
    else await absent(backend);
    const configured = run();
    expect(configured.status).toBe(0);
    expect(configured.stderr).toBe("");
    expect(configured.stdout).toContain(`Engine browser: ${browserEngine ?? "crawl4ai"}`);
    expect(configured.stdout).toContain("docker compose -p saleskit-sourcing-local -f docker-compose.sourcing.yml up -d --build");
    const output = `${configured.stdout}${configured.stderr}`;
    const b = await env(backend);
    for (const key of ["CORE_AI_API_KEY", "SOURCING_BROWSER_API_KEY", "SEARXNG_SECRET"]) {
      expect(output).not.toContain(b[key]);
    }
  });
});
