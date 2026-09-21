import { describe, expect, it } from "vitest";
import { clientIp, rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("mengizinkan sampai limit lalu menolak", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60_000).ok).toBe(true);
    }
    const denied = rateLimit(key, 5, 60_000);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it("window terpisah per key", () => {
    const a = `test:${Math.random()}`;
    const b = `test:${Math.random()}`;
    expect(rateLimit(a, 1, 60_000).ok).toBe(true);
    expect(rateLimit(a, 1, 60_000).ok).toBe(false);
    expect(rateLimit(b, 1, 60_000).ok).toBe(true);
  });

  it("reset setelah window lewat", () => {
    const key = `test:${Math.random()}`;
    expect(rateLimit(key, 1, -1).ok).toBe(true); // window langsung kedaluwarsa
    expect(rateLimit(key, 1, 60_000).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("pakai IP pertama dari x-forwarded-for", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("fallback ke unknown", () => {
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
