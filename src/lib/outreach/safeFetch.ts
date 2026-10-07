import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";

/**
 * SSRF-safe fetcher for UNTRUSTED website URLs.
 * - http/https only, default ports only, no credentials in URL
 * - blocks localhost / internal hostnames / metadata endpoints
 * - validates EVERY resolved IP at connect time (inside the socket lookup → no DNS-rebinding gap)
 * - manual redirects, each re-validated, capped
 * - timeout, decompressed response-size cap, content-type allowlist
 */

export interface SafeFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
  allowedContentTypes?: string[];
  /** Test seam: decides whether a resolved IP may be connected to. Default: isPublicIp. */
  ipPolicy?: (ip: string) => boolean;
  /** Test seam: override DNS resolution. */
  resolver?: (host: string) => Promise<LookupAddress[]>;
  userAgent?: string;
  /** Allowed explicit ports. Default: none besides the protocol default (80/443). Test seam only. */
  allowedPorts?: number[];
}

export interface SafeFetchResult {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  bytes: number;
  redirects: string[];
  fetchedAt: string;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOSTNAMES = [
  /^localhost$/,
  /\.localhost$/,
  /\.local$/,
  /\.internal$/,
  /\.intranet$/,
  /\.home\.arpa$/,
  /^metadata$/,
  /^metadata\.google\.internal$/,
  /^instance-data$/,
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

function inV4Cidr(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const V4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local incl. 169.254.169.254 metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0]!;
  // embedded IPv4 tail
  const v4tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4tail) {
    const n = ipv4ToInt(v4tail[1]!);
    s = s.replace(v4tail[1]!, `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`);
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  if (s.includes("::")) {
    const fill = 8 - h.length - t.length;
    if (fill < 0) return null;
    return [...h, ...Array(fill).fill("0"), ...t].map((x) => parseInt(x, 16));
  }
  if (h.length !== 8) return null;
  return h.map((x) => parseInt(x, 16));
}

export function isPublicIp(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return !V4_BLOCKED.some(([b, bits]) => inV4Cidr(ip, b, bits)) && ip !== "255.255.255.255";
  if (fam === 6) {
    const w = expandV6(ip);
    if (!w || w.some((x) => Number.isNaN(x))) return false;
    if (w.every((x) => x === 0)) return false; // ::
    if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return false; // ::1
    const v4From = (a: number, b: number) => `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
    // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible
    if (w.slice(0, 5).every((x) => x === 0) && (w[5] === 0xffff || w[5] === 0)) return isPublicIp(v4From(w[6]!, w[7]!));
    // NAT64 64:ff9b::/96
    if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((x) => x === 0)) return isPublicIp(v4From(w[6]!, w[7]!));
    const first = w[0]!;
    if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 ULA
    if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return false; // multicast
    if (first === 0x2001 && w[1] === 0x0db8) return false; // documentation
    if (first === 0x0100 && w.slice(1, 4).every((x) => x === 0)) return false; // discard-only
    if (first === 0x2002) return isPublicIp(v4From(w[1]!, w[2]!)); // 6to4
    return true;
  }
  return false;
}

/** Static URL validation (before any network activity). Throws UnsafeUrlError. */
export function assertSafeUrl(raw: string, ipPolicy: (ip: string) => boolean = isPublicIp, allowedPorts: number[] = []): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError(`Invalid URL: ${raw.slice(0, 200)}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UnsafeUrlError(`Protocol not allowed: ${u.protocol}`);
  if (u.username || u.password) throw new UnsafeUrlError("Credentials in URL not allowed");
  if (u.port && !allowedPorts.includes(Number(u.port)) && !((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443"))) {
    throw new UnsafeUrlError(`Port not allowed: ${u.port}`);
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) throw new UnsafeUrlError("Empty host");
  if (BLOCKED_HOSTNAMES.some((re) => re.test(host))) throw new UnsafeUrlError(`Host not allowed: ${host}`);
  if (net.isIP(host)) {
    if (!ipPolicy(host)) throw new UnsafeUrlError(`IP not allowed: ${host}`);
  } else if (!host.includes(".")) {
    throw new UnsafeUrlError(`Single-label host not allowed: ${host}`);
  }
  return u;
}

function defaultResolver(host: string): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) =>
    dnsLookup(host, { all: true, verbatim: true }, (err, addrs) => (err ? reject(err) : resolve(addrs))),
  );
}

const DEFAULT_CT = ["text/html", "application/xhtml+xml", "text/plain"];

/**
 * Honest research user-agent (names us + a contact URL). It deliberately avoids the token "Bot": live small-business
 * hosting (nginx rules matching /bot/i) answered HTTP 403 to "AgentMakersResearchBot/0.1" and 200/301 to this one.
 */
export const DEFAULT_USER_AGENT = "AgentMakersResearch/0.1 (+https://www.agentmakers.io)";

function fetchOnce(u: URL, opts: Required<Pick<SafeFetchOptions, "timeoutMs" | "maxBytes">> & SafeFetchOptions) {
  const ipPolicy = opts.ipPolicy ?? isPublicIp;
  const resolver = opts.resolver ?? defaultResolver;
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    // Connect-time lookup: every address is validated, the validated address is the one used.
    const lookup = (hostname: string, options: unknown, cb: (...args: unknown[]) => void) => {
      const wantAll = typeof options === "object" && options !== null && (options as { all?: boolean }).all;
      const literal = net.isIP(hostname);
      const p = literal ? Promise.resolve([{ address: hostname, family: literal }]) : resolver(hostname);
      p.then((addrs) => {
        if (!addrs.length) return cb(new UnsafeUrlError(`No DNS records for ${hostname}`));
        const bad = addrs.find((a) => !ipPolicy(a.address));
        if (bad) return cb(new UnsafeUrlError(`Resolved to blocked IP ${bad.address} for ${hostname}`));
        if (wantAll) return cb(null, addrs);
        return cb(null, addrs[0]!.address, addrs[0]!.family);
      }, (err) => cb(err));
    };
    const req = lib.request(
      u,
      {
        method: "GET",
        lookup: lookup as never,
        headers: {
          "user-agent": opts.userAgent ?? DEFAULT_USER_AGENT,
          accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "nl,en;q=0.8",
        },
        timeout: opts.timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (enc.includes("gzip")) stream = res.pipe(zlib.createGunzip());
        else if (enc.includes("deflate")) stream = res.pipe(zlib.createInflate());
        else if (enc.includes("br")) stream = res.pipe(zlib.createBrotliDecompress());
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > opts.maxBytes) {
          req.destroy();
          return reject(new Error(`Response too large (declared ${declared} bytes)`));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            req.destroy();
            reject(new Error(`Response exceeded ${opts.maxBytes} bytes`));
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on("error", reject);
      },
    );
    const hardTimer = setTimeout(() => req.destroy(new Error(`Timeout after ${opts.timeoutMs}ms`)), opts.timeoutMs);
    req.on("timeout", () => req.destroy(new Error(`Timeout after ${opts.timeoutMs}ms`)));
    req.on("error", (e) => {
      clearTimeout(hardTimer);
      reject(e);
    });
    req.on("close", () => clearTimeout(hardTimer));
    req.end();
  });
}

function decode(body: Buffer, contentType: string): string {
  const cs = contentType.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  try {
    return new TextDecoder(cs && cs !== "utf8" ? cs : "utf-8", { fatal: false }).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

export async function safeFetch(raw: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxRedirects = Math.min(options.maxRedirects ?? 5, 10);
  const allowed = options.allowedContentTypes ?? DEFAULT_CT;
  const redirects: string[] = [];
  let current = assertSafeUrl(raw, options.ipPolicy, options.allowedPorts);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetchOnce(current, options);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.location;
      if (!loc) throw new Error(`Redirect ${res.status} without Location`);
      if (hop === maxRedirects) throw new Error(`Too many redirects (>${maxRedirects})`);
      const next = new URL(loc, current).toString();
      redirects.push(next);
      current = assertSafeUrl(next, options.ipPolicy, options.allowedPorts); // re-check every hop
      continue;
    }
    const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
    if (!allowed.some((t) => contentType.startsWith(t))) {
      throw new Error(`Content-type not allowed: ${contentType || "(none)"}`);
    }
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    return {
      url: raw,
      finalUrl: current.toString(),
      status: res.status,
      contentType,
      body: decode(res.body, contentType),
      bytes: res.body.length,
      redirects,
      fetchedAt: new Date().toISOString(),
    };
  }
  throw new Error("Redirect loop");
}
