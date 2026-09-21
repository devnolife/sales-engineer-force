import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureFirecrawl } from "./setup-firecrawl.mjs";

const apiKey = "fc-synthetic-key-for-setup-tests";
const script = fileURLToPath(new URL("./setup-firecrawl.mjs", import.meta.url));
const roots: string[] = [];
const begin = "# BEGIN SalesKit Firecrawl setup";
const end = "# END SalesKit Firecrawl setup";

async function fixture(appEnv?: string, backendEnv?: string) {
  const root = path.resolve(path.dirname(script), "../.data", `firecrawl-setup-fixture-${randomUUID()}`);
  roots.push(root);
  const app = path.join(root, "sales-engineer-force");
  const backend = path.join(root, "core-ai");
  await fs.mkdir(path.join(app, "scripts"), { recursive: true });
  await fs.mkdir(backend);
  await fs.writeFile(path.join(app, "package.json"), '{"name":"sales-engineer-force"}');
  await fs.writeFile(path.join(backend, "package.json"), '{"name":"core-ai"}');
  await fs.writeFile(path.join(app, ".env.example"), [
    "# Keep the application configuration",
    'DATABASE_URL="file:./dev.db"',
    'BETTER_AUTH_SECRET="ganti-dengan-secret-acak"',
    'CRON_SECRET="ganti-dengan-secret-acak"',
    "SOURCING_MODE=mock",
    "CORE_AI_URL=http://localhost:8787",
    "CORE_AI_API_KEY=",
    "SOURCING_MARGIN_PERCENT=30",
    "",
  ].join("\n"));
  await fs.writeFile(path.join(backend, ".env.example"),
    "PORT=8787\nAI_PROVIDER=mock\nSOURCING_PROVIDER=firecrawl\n");
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
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe("Firecrawl local setup", () => {
  it("configures both services with private files and never puts the Cloud key in Next.js", async () => {
    const { app, backend } = await fixture();
    await configureFirecrawl(app, apiKey);
    const a = await env(app);
    const b = await env(backend);
    expect(a).toMatchObject({
      SOURCING_MODE: "live", SOURCING_LIVE_PROVIDER: "firecrawl", CORE_AI_URL: "http://127.0.0.1:8787",
      DATABASE_URL: "file:./dev.db", SOURCING_MARGIN_PERCENT: "30",
    });
    expect(b).toMatchObject({ SOURCING_PROVIDER: "firecrawl", FIRECRAWL_API_KEY: apiKey, AI_PROVIDER: "mock" });
    expect(a.FIRECRAWL_API_KEY).toBeUndefined();
    expect(await fs.readFile(path.join(app, ".env"), "utf8")).not.toContain(apiKey);
    expect(a.CORE_AI_API_KEY).toMatch(/^[a-f0-9]{64}$/);
    expect(a.CORE_AI_API_KEY).toBe(b.CORE_AI_API_KEY);
    expect(a.BETTER_AUTH_SECRET).toMatch(/^[a-f0-9]{64}$/);
    expect(a.CRON_SECRET).toMatch(/^[a-f0-9]{64}$/);
    expect(a.CORE_AI_API_KEY).not.toBe(a.BETTER_AUTH_SECRET);
    for (const dir of [app, backend]) {
      expect((await fs.stat(path.join(dir, ".env"))).mode & 0o777).toBe(0o600);
    }
  });

  it("preserves existing secrets, comments, multiline values, provider, margin and backend port", async () => {
    const appEnv = '# Keep me\nDATABASE_URL="file:./existing.db"\nBETTER_AUTH_SECRET=existing-auth\nCRON_SECRET=existing-cron\nSOURCING_MARGIN_PERCENT=25\nCORE_AI_URL=http://localhost:18900\nCORE_AI_API_KEY=shared-synthetic-kept-token\nEXTRA="line1\nline2"\n';
    const backendEnv = "PORT=18900\nAI_PROVIDER=ollama\nOLLAMA_MODEL=local-model\nCORE_AI_API_KEY=shared-synthetic-kept-token\n";
    const { app, backend } = await fixture(appEnv, backendEnv);
    await configureFirecrawl(app, apiKey);
    expect(await env(app)).toMatchObject({
      DATABASE_URL: "file:./existing.db", BETTER_AUTH_SECRET: "existing-auth",
      CRON_SECRET: "existing-cron", SOURCING_MARGIN_PERCENT: "25",
      EXTRA: "line1\nline2", CORE_AI_API_KEY: "shared-synthetic-kept-token",
      CORE_AI_URL: "http://127.0.0.1:18900", SOURCING_MODE: "live",
    });
    expect(await env(backend)).toMatchObject({
      PORT: "18900", AI_PROVIDER: "ollama", OLLAMA_MODEL: "local-model",
      CORE_AI_API_KEY: "shared-synthetic-kept-token",
    });
    expect(await fs.readFile(path.join(app, ".env"), "utf8")).toContain("# Keep me");
  });

  it("loads the effective values through actual Next.js and Node env loaders", async () => {
    const { app, backend } = await fixture();
    await configureFirecrawl(app, apiKey);
    const nextRequire = createRequire(createRequire(import.meta.url).resolve("next/package.json"));
    const nextEnv = nextRequire.resolve("@next/env");
    const nodeEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "development",
    };
    const next = spawnSync(process.execPath, ["-e", `
      require(process.argv[1]).loadEnvConfig(process.argv[2], true);
      console.log(JSON.stringify({
        mode: process.env.SOURCING_MODE, url: process.env.CORE_AI_URL,
        key: process.env.CORE_AI_API_KEY, cloud: process.env.FIRECRAWL_API_KEY,
        auth: process.env.BETTER_AUTH_SECRET
      }));
    `, nextEnv, app], { encoding: "utf8", env: nodeEnv });
    expect(next.status).toBe(0);
    const values = JSON.parse(next.stdout);
    const expected = await env(app);
    expect(values).toEqual({
      mode: "live", url: "http://127.0.0.1:8787",
      key: expected.CORE_AI_API_KEY, auth: expected.BETTER_AUTH_SECRET,
    });
    const core = spawnSync(process.execPath, [`--env-file=${path.join(backend, ".env")}`, "-e", `
      console.log(JSON.stringify({
        provider: process.env.SOURCING_PROVIDER,
        key: process.env.CORE_AI_API_KEY, cloud: process.env.FIRECRAWL_API_KEY
      }));
    `], { encoding: "utf8", env: nodeEnv });
    expect(core.status).toBe(0);
    expect(JSON.parse(core.stdout)).toEqual({
      provider: "firecrawl", key: expected.CORE_AI_API_KEY, cloud: apiKey,
    });
  });

  it.each(["app", "backend"])("reuses an existing shared key from %s", async (owner) => {
    const value = "CORE_AI_API_KEY=shared-synthetic-existing-token\n";
    const { app, backend } = await fixture(owner === "app" ? value : undefined, owner === "backend" ? value : undefined);
    await configureFirecrawl(app, apiKey);
    expect((await env(app)).CORE_AI_API_KEY).toBe("shared-synthetic-existing-token");
    expect((await env(backend)).CORE_AI_API_KEY).toBe("shared-synthetic-existing-token");
  });

  it("is idempotent and rotates only the Cloud key in the managed block", async () => {
    const { app, backend } = await fixture();
    await configureFirecrawl(app, apiKey);
    const appBefore = await fs.readFile(path.join(app, ".env"), "utf8");
    const backendBefore = await fs.readFile(path.join(backend, ".env"), "utf8");
    await configureFirecrawl(app, apiKey);
    expect(await fs.readFile(path.join(app, ".env"), "utf8")).toBe(appBefore);
    expect(await fs.readFile(path.join(backend, ".env"), "utf8")).toBe(backendBefore);
    await configureFirecrawl(app, "fc-synthetic-rotated-key");
    expect(await fs.readFile(path.join(app, ".env"), "utf8")).toBe(appBefore);
    const rotated = await fs.readFile(path.join(backend, ".env"), "utf8");
    expect(rotated).not.toContain(apiKey);
    expect(rotated.split(begin)).toHaveLength(2);
    expect((await env(backend)).FIRECRAWL_API_KEY).toBe("fc-synthetic-rotated-key");
  });

  it.each(["", "short", "fc-synthetic key", "fc-synthetic\nOTHER=changed", "fc-synthetic$VALUE"])(
    "rejects invalid token input without writing any env file: %j", async (value) => {
      const { app, backend } = await fixture();
      await expect(configureFirecrawl(app, value)).rejects.toThrow(/key.*valid/i);
      await absent(app);
      await absent(backend);
    },
  );

  it("refuses mismatched shared keys instead of replacing existing configuration", async () => {
    const a = "CORE_AI_API_KEY=shared-synthetic-one\n";
    const b = "CORE_AI_API_KEY=shared-synthetic-two\n";
    const { app, backend } = await fixture(a, b);
    await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(/berbeda/);
    expect(await fs.readFile(path.join(app, ".env"), "utf8")).toBe(a);
    expect(await fs.readFile(path.join(backend, ".env"), "utf8")).toBe(b);
  });

  it("refuses to redirect an existing remote backend to local", async () => {
    const original = "CORE_AI_URL=https://existing-backend.example\n";
    const { app, backend } = await fixture(original);
    await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(/lokal/);
    expect(await fs.readFile(path.join(app, ".env"), "utf8")).toBe(original);
    await absent(backend);
  });

  it.each(["0", "65536", "invalid"])("rejects backend port %s before writing", async (port) => {
    const { app, backend } = await fixture(undefined, `PORT=${port}\n`);
    await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(/PORT/);
    await absent(app);
    expect((await env(backend)).PORT).toBe(port);
  });

  it.each([".env.local", ".env.development.local", ".env.development", ".env.production", ".env.production.local"])(
    "refuses a higher-priority Next override in %s", async (name) => {
      const { app, backend } = await fixture();
      await fs.writeFile(path.join(app, name), "SOURCING_MODE=mock\n");
      await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(name);
      await absent(app);
      await absent(backend);
    },
  );

  it("refuses inherited configuration overrides without exposing their values", async () => {
    const { app, backend } = await fixture();
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-synthetic-inherited-secret");
    await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(/FIRECRAWL_API_KEY/);
    await absent(app);
    await absent(backend);
  });

  it("refuses a live-provider override when deliberately switching back to Firecrawl", async () => {
    const { app, backend } = await fixture();
    await fs.writeFile(path.join(app, ".env.local"), "SOURCING_LIVE_PROVIDER=selfhost\n");
    await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(/SOURCING_LIVE_PROVIDER/);
    await absent(app);
    await absent(backend);
  });

  it.each(["FIRECRAWL_API_KEY", "NEXT_PUBLIC_FIRECRAWL_API_KEY", "NEXT_PUBLIC_CORE_AI_API_KEY"])(
    "rejects a misplaced application secret %s", async (name) => {
      const { app, backend } = await fixture(`${name}=fc-synthetic-misplaced-key\n`);
      await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(/hanya.*core-ai/i);
      await absent(backend);
    },
  );

  it.each(["FIRECRAWL_API_KEY", "NEXT_PUBLIC_FIRECRAWL_API_KEY", "NEXT_PUBLIC_CORE_AI_API_KEY"])(
    "rejects exposed keys in higher-priority Next files: %s", async (name) => {
      const { app, backend } = await fixture();
      await fs.writeFile(path.join(app, ".env.local"), `${name}=fc-synthetic-misplaced-key\n`);
      await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(/hanya.*core-ai/i);
      await absent(app);
      await absent(backend);
    },
  );

  it("never copies the Cloud key into Next.js by reusing it as the shared key", async () => {
    const { app, backend } = await fixture(undefined, `CORE_AI_API_KEY=${apiKey}\n`);
    await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(/sama dengan.*Firecrawl/);
    await absent(app);
    expect(await fs.readFile(path.join(backend, ".env"), "utf8")).toBe(`CORE_AI_API_KEY=${apiKey}\n`);
  });

  it("does not copy a preserved Cloud key into Next.js when rotating to a different Firecrawl key", async () => {
    const original = `CORE_AI_API_KEY=${apiKey}\nFIRECRAWL_API_KEY=${apiKey}\n`;
    const { app, backend } = await fixture(undefined, original);
    await expect(configureFirecrawl(app, "fc-synthetic-new-cloud-key")).rejects.toThrow(/sama dengan.*Firecrawl/);
    await absent(app);
    expect(await fs.readFile(path.join(backend, ".env"), "utf8")).toBe(original);
  });

  it("rejects symlink targets without changing the linked file", async () => {
    const { root, app, backend } = await fixture();
    const other = path.join(root, "outside.env");
    await fs.writeFile(other, "KEEP=unchanged\n");
    await fs.symlink(other, path.join(app, ".env"));
    await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(/berkas biasa/);
    expect(await fs.readFile(other, "utf8")).toBe("KEEP=unchanged\n");
    await absent(backend);
  });

  it("rejects malformed managed blocks and never deletes extra configuration inside them", async () => {
    const { app, backend } = await fixture(`${begin}\nBROKEN=1\n`);
    await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(/blok/);
    await fs.writeFile(path.join(app, ".env"), `${begin}\nKEEP=unchanged\n${end}\n`);
    await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(/KEEP/);
    expect((await env(app)).KEEP).toBe("unchanged");
    await absent(backend);
  });

  it("rolls back the backend if writing the application fails and removes temporary secrets", async () => {
    const { app, backend } = await fixture("APP_KEEP=1\n", "BACKEND_KEEP=2\n");
    const rename = fs.rename.bind(fs);
    let failed = false;
    vi.spyOn(fs, "rename").mockImplementation(async (source, target) => {
      if (String(target) === path.join(app, ".env") && !failed) {
        failed = true;
        throw Object.assign(new Error("synthetic write failure"), { code: "EACCES" });
      }
      return rename(source, target);
    });
    await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(/dipulihkan/);
    expect(await fs.readFile(path.join(app, ".env"), "utf8")).toBe("APP_KEEP=1\n");
    expect(await fs.readFile(path.join(backend, ".env"), "utf8")).toBe("BACKEND_KEEP=2\n");
    for (const dir of [app, backend]) {
      expect((await fs.readdir(dir)).filter((name) => name.includes(".tmp"))).toEqual([]);
    }
  });

  it("rejects missing backend checkout rather than writing half a setup", async () => {
    const { app, backend } = await fixture();
    await fs.unlink(path.join(backend, "package.json"));
    await expect(configureFirecrawl(app, apiKey)).rejects.toThrow(/core-ai/);
    await absent(app);
    await absent(backend);
  });

  it("supports help, rejects non-TTY input and never echoes a key supplied as an argument", async () => {
    const { app, backend } = await fixture();
    const target = path.join(app, "scripts/setup-firecrawl.mjs");
    await fs.copyFile(script, target);
    const run = (...args: string[]) => spawnSync(process.execPath, [target, ...args], {
      encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" },
    });
    const help = run("--help");
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("setup:firecrawl");
    const piped = run();
    expect(piped.status).toBe(1);
    expect(piped.stderr).toMatch(/terminal interaktif/);
    const unsafe = run(apiKey);
    expect(unsafe.status).toBe(1);
    expect(`${unsafe.stdout}${unsafe.stderr}`).not.toContain(apiKey);
    await absent(app);
    await absent(backend);
  });
});
