import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertSafeUrl, isPublicIp, safeFetch, UnsafeUrlError, type SafeFetchOptions } from "../../src/lib/outreach/safeFetch.js";

describe("safe URL validation (static)", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com/",
    "javascript:alert(1)",
    "gopher://example.com/",
    "http://user:pass@example.com/",
    "http://localhost/",
    "http://foo.localhost/",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fd00::1]/",
    "http://0x7f000001/",
    "http://2130706433/",
    "http://10.0.0.1/",
    "http://192.168.1.10/",
    "http://172.16.5.4/",
    "http://100.64.0.1/",
    "http://0.0.0.0/",
    "http://example.com:8080/",
    "http://intranet/",
    "http://printer.local/",
  ])("rejects %s", (u) => {
    expect(() => assertSafeUrl(u)).toThrow(UnsafeUrlError);
  });
  it.each(["https://www.tandarts-dewit.nl/contact", "http://example.com/", "https://example.com:443/x", "http://93.184.216.34/"])("accepts %s", (u) => {
    expect(() => assertSafeUrl(u)).not.toThrow();
  });
  it("classifies IPs", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("2606:4700:4700::1111")).toBe(true);
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.0.1", "::1", "::", "fe80::1", "fc00::1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "2002:a00:1::", "224.0.0.1", "255.255.255.255"]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
});

describe("safeFetch against a local test server", () => {
  let server: http.Server;
  let port = 0;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? "/";
      if (url === "/ok") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end("<html><title>ok</title>hallo</html>"); return; }
      if (url === "/big") { res.writeHead(200, { "content-type": "text/html" }); res.end("x".repeat(50_000)); return; }
      if (url === "/big-declared") { res.writeHead(200, { "content-type": "text/html", "content-length": "999999999" }); res.end("x"); return; }
      if (url === "/gzip-bomb") { res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }); res.end(zlib.gzipSync(Buffer.alloc(5_000_000, 97))); return; }
      if (url === "/pdf") { res.writeHead(200, { "content-type": "application/pdf" }); res.end("%PDF"); return; }
      if (url === "/slow") { return; } // never answers
      if (url === "/redir-meta") { res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); res.end(); return; }
      if (url === "/redir-private-host") { res.writeHead(302, { location: `http://evil.test.example:${port}/ok` }); res.end(); return; }
      if (url === "/redir-ok") { res.writeHead(301, { location: "/ok" }); res.end(); return; }
      if (url === "/loop") { res.writeHead(302, { location: "/loop" }); res.end(); return; }
      res.writeHead(404, { "content-type": "text/html" }); res.end("nope");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  // "site.test.example" resolves to our loopback server and is explicitly allowed by this test policy;
  // everything else uses the production policy.
  const opts = (o: Partial<SafeFetchOptions> = {}): SafeFetchOptions => ({
    timeoutMs: 1500,
    maxBytes: 10_000,
    maxRedirects: 3,
    allowedPorts: [port],
    resolver: async (h) => (h === "site.test.example" ? [{ address: "127.0.0.1", family: 4 }] : h === "evil.test.example" ? [{ address: "10.0.0.7", family: 4 }] : [{ address: "93.184.216.34", family: 4 }]),
    ipPolicy: (ip) => ip === "127.0.0.1" || isPublicIp(ip),
    ...o,
  });
  const u = (p: string) => `http://site.test.example:${port}${p}`;

  it("fetches a normal page", async () => {
    const r = await safeFetch(u("/ok"), opts());
    expect(r.status).toBe(200);
    expect(r.body).toContain("hallo");
  });
  it("follows a safe relative redirect and records it", async () => {
    const r = await safeFetch(u("/redir-ok"), opts());
    expect(r.finalUrl).toBe(u("/ok"));
    expect(r.redirects).toHaveLength(1);
  });
  it("re-checks redirects: redirect to metadata endpoint is blocked", async () => {
    await expect(safeFetch(u("/redir-meta"), opts())).rejects.toThrow(UnsafeUrlError);
  });
  it("blocks redirect to a hostname that resolves to a private IP (checked at connect time)", async () => {
    await expect(safeFetch(u("/redir-private-host"), opts())).rejects.toThrow(/blocked IP 10\.0\.0\.7/);
  });
  it("blocks DNS-rebinding style hostnames resolving to private ranges", async () => {
    await expect(safeFetch(`http://evil.test.example:${port}/ok`, opts())).rejects.toThrow(/blocked IP/);
  });
  it("enforces redirect limit", async () => {
    await expect(safeFetch(u("/loop"), opts())).rejects.toThrow(/Too many redirects/);
  });
  it("enforces response-size limit (streamed and declared)", async () => {
    await expect(safeFetch(u("/big"), opts())).rejects.toThrow(/exceeded/);
    await expect(safeFetch(u("/big-declared"), opts())).rejects.toThrow(/too large/);
  });
  it("enforces size limit on decompressed bytes (gzip bomb)", async () => {
    await expect(safeFetch(u("/gzip-bomb"), opts())).rejects.toThrow(/exceeded/);
  });
  it("enforces content-type allowlist", async () => {
    await expect(safeFetch(u("/pdf"), opts())).rejects.toThrow(/Content-type not allowed/);
  });
  it("enforces timeout", async () => {
    const t0 = Date.now();
    await expect(safeFetch(u("/slow"), opts({ timeoutMs: 300 }))).rejects.toThrow(/Timeout/);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it("production policy refuses the loopback server outright", async () => {
    await expect(safeFetch(u("/ok"), opts({ ipPolicy: undefined }))).rejects.toThrow(/blocked IP 127\.0\.0\.1/);
  });
});
