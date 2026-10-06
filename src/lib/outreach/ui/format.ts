/** Formatting helpers (client-safe, locale nl-NL). */
export function eur(value: number | string | null | undefined, digits = 2): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  return `€${n.toFixed(n !== 0 && Math.abs(n) < 0.01 ? 4 : digits).replace(".", ",")}`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function duration(fromIso: string | null | undefined, toIso: string | null | undefined, now: number = Date.now()): string {
  if (!fromIso) return "—";
  const from = Date.parse(fromIso);
  const to = toIso ? Date.parse(toIso) : now;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return "—";
  const s = Math.round((to - from) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}u ${m % 60}m`;
}

export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
