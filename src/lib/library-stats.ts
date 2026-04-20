import type { ArticleSummary } from "./articles";

export interface SourceStat {
  name: string;
  count: number;
  sampleUrl: string;
}

export interface DayBucket {
  /** ISO date YYYY-MM-DD for the bucket. */
  date: string;
  /** Day-of-week label (single letter, Mon-first). */
  label: string;
  saved: number;
  read: number;
}

export interface WeekStats {
  days: DayBucket[];
  saved: number;
  read: number;
  /** Estimated minutes of reading still to do across the inbox. */
  remainingMinutes: number;
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday of the week containing `now`, in UTC. */
function startOfWeek(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = (dow + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

export function computeWeekStats(
  articles: ArticleSummary[],
  now: Date = new Date(),
): WeekStats {
  const start = startOfWeek(now);
  const days: DayBucket[] = DAY_LABELS.map((label, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return { date: isoDate(d), label, saved: 0, read: 0 };
  });

  const byDate = new Map(days.map((d) => [d.date, d]));

  for (const a of articles) {
    const savedDate = isoDate(new Date(a.savedAt));
    const savedBucket = byDate.get(savedDate);
    if (savedBucket) savedBucket.saved += 1;

    if (a.readAt) {
      const readDate = isoDate(new Date(a.readAt));
      const readBucket = byDate.get(readDate);
      if (readBucket) readBucket.read += 1;
    }
  }

  let saved = 0;
  let read = 0;
  for (const d of days) {
    saved += d.saved;
    read += d.read;
  }

  const remainingMinutes = articles
    .filter((a) => !a.archivedAt && !a.readAt)
    .reduce((sum, a) => sum + a.readMinutes, 0);

  return { days, saved, read, remainingMinutes };
}

export function computeSourceStats(
  articles: ArticleSummary[],
  limit = 8,
): SourceStat[] {
  const map = new Map<string, SourceStat>();
  for (const a of articles) {
    if (a.archivedAt) continue;
    const name = a.source?.trim();
    if (!name) continue;
    const existing = map.get(name);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(name, { name, count: 1, sampleUrl: a.url });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export interface TagStat {
  name: string;
  count: number;
}

export function computeTagStats(
  articles: ArticleSummary[],
  limit = 14,
): TagStat[] {
  const counts = new Map<string, number>();
  for (const a of articles) {
    if (a.archivedAt) continue;
    for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function formatRemaining(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Deterministic hex hash → integer. Used to pick a source's tile colour so
 * the same publication always renders the same shade.
 */
export function sourceHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SOURCE_PALETTE = [
  { bg: "#d4d8c8", fg: "#3d4533" }, // sage
  { bg: "#e6d4c0", fg: "#5a4534" }, // warm beige
  { bg: "#d8d2e0", fg: "#3f3a4f" }, // lavender stone
  { bg: "#e8d2cc", fg: "#5b3a32" }, // dusty rose
  { bg: "#cfd8d6", fg: "#314440" }, // slate green
  { bg: "#dccfa8", fg: "#534720" }, // ochre
  { bg: "#c4cdd6", fg: "#2d3b48" }, // pale steel
  { bg: "#d4c8b8", fg: "#4a3e2c" }, // bone
];

export function sourcePalette(name: string): { bg: string; fg: string } {
  const idx = sourceHash(name.toLowerCase()) % SOURCE_PALETTE.length;
  return SOURCE_PALETTE[idx];
}

export function sourceInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const first = trimmed.replace(/^the\s+/i, "")[0] ?? trimmed[0];
  return first.toUpperCase();
}
