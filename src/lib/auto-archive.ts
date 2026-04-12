import { createHash } from "node:crypto";
import { z } from "zod";
import type { Volume } from "folio-db-next";
import type { AuthedUserId } from "./auth-types";
import { AUTO_ARCHIVE_REGISTRY_VOLUME, getFolio } from "./folio";
import { listArticles, setArchived } from "./articles";

// ── Schedule options ────────────────────────────────────────────────

// `null` = never auto-archive for this rule. Numbers are days.
export type AutoArchiveDays = null | 14 | 30 | 90 | 180;

export const AUTO_ARCHIVE_OPTIONS: ReadonlyArray<{
  value: AutoArchiveDays;
  label: string;
}> = [
  { value: null, label: "Never" },
  { value: 14, label: "2 weeks" },
  { value: 30, label: "1 month" },
  { value: 90, label: "3 months" },
  { value: 180, label: "6 months" },
];

function isValidDays(v: unknown): v is AutoArchiveDays {
  return v === null || v === 14 || v === 30 || v === 90 || v === 180;
}

// ── Preferences schema ─────────────────────────────────────────────

export interface AutoArchivePreferences {
  // Archive unread inbox articles whose savedAt is older than this many days.
  unreadAfterDays: AutoArchiveDays;
  // Archive read inbox articles whose readAt is older than this many days.
  readAfterDays: AutoArchiveDays;
  updatedAt: string | null;
}

type AutoArchiveFrontmatter = {
  unreadAfterDays: AutoArchiveDays;
  readAfterDays: AutoArchiveDays;
  userId: string;
  updatedAt: string | null;
  lastRunAt: string | null;
  [key: string]: unknown;
};

const daysSchema = z
  .union([
    z.null(),
    z.literal(14),
    z.literal(30),
    z.literal(90),
    z.literal(180),
  ])
  .default(null);

const autoArchiveFrontmatterSchema: z.ZodType<AutoArchiveFrontmatter> =
  z.object({
    unreadAfterDays: daysSchema,
    readAfterDays: daysSchema,
    userId: z.string(),
    updatedAt: z.string().nullable().default(null),
    lastRunAt: z.string().nullable().default(null),
  }) as unknown as z.ZodType<AutoArchiveFrontmatter>;

function registryVolume(): Volume<AutoArchiveFrontmatter> {
  return getFolio().volume<AutoArchiveFrontmatter>(
    AUTO_ARCHIVE_REGISTRY_VOLUME,
    { schema: autoArchiveFrontmatterSchema },
  );
}

// Stable slug — same 24-hex truncation as digest registry.
function slugForUser(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 24);
}

const DEFAULT_PREFS: AutoArchivePreferences = {
  unreadAfterDays: null,
  readAfterDays: null,
  updatedAt: null,
};

// ── Read / write ────────────────────────────────────────────────────

export async function getAutoArchivePreferences(
  userId: AuthedUserId,
): Promise<AutoArchivePreferences> {
  const page = await registryVolume().get(slugForUser(userId));
  if (!page) return { ...DEFAULT_PREFS };
  return {
    unreadAfterDays: page.frontmatter.unreadAfterDays,
    readAfterDays: page.frontmatter.readAfterDays,
    updatedAt: page.frontmatter.updatedAt,
  };
}

export async function setAutoArchivePreferences(
  userId: AuthedUserId,
  opts: { unreadAfterDays: AutoArchiveDays; readAfterDays: AutoArchiveDays },
): Promise<AutoArchivePreferences> {
  if (!isValidDays(opts.unreadAfterDays) || !isValidDays(opts.readAfterDays)) {
    throw new Error("Invalid auto-archive duration");
  }
  const slug = slugForUser(userId);
  const vol = registryVolume();

  // If both rules are off, drop the registry entry so the cron skips this user.
  if (opts.unreadAfterDays === null && opts.readAfterDays === null) {
    try {
      await vol.delete(slug);
    } catch {
      // Already absent — fine
    }
    return { ...DEFAULT_PREFS };
  }

  const existing = await vol.get(slug);
  const updatedAt = new Date().toISOString();
  const frontmatter: AutoArchiveFrontmatter = {
    unreadAfterDays: opts.unreadAfterDays,
    readAfterDays: opts.readAfterDays,
    userId,
    updatedAt,
    lastRunAt: existing?.frontmatter.lastRunAt ?? null,
  };
  await vol.set(slug, { frontmatter, body: "" });
  return {
    unreadAfterDays: opts.unreadAfterDays,
    readAfterDays: opts.readAfterDays,
    updatedAt,
  };
}

// ── Subscribers (for the cron) ─────────────────────────────────────

export interface AutoArchiveSubscriber {
  userId: string;
  unreadAfterDays: AutoArchiveDays;
  readAfterDays: AutoArchiveDays;
  lastRunAt: string | null;
}

export async function listAutoArchiveSubscribers(): Promise<
  AutoArchiveSubscriber[]
> {
  const pages = await registryVolume().list();
  return pages
    .filter(
      (p) =>
        p.frontmatter.unreadAfterDays !== null ||
        p.frontmatter.readAfterDays !== null,
    )
    .map((p) => ({
      userId: p.frontmatter.userId,
      unreadAfterDays: p.frontmatter.unreadAfterDays,
      readAfterDays: p.frontmatter.readAfterDays,
      lastRunAt: p.frontmatter.lastRunAt ?? null,
    }));
}

export async function markAutoArchiveRun(userId: string): Promise<void> {
  const slug = slugForUser(userId);
  try {
    await registryVolume().patch(slug, {
      frontmatter: { lastRunAt: new Date().toISOString() },
    });
  } catch {
    // Registry entry may have been cleared by a concurrent disable — ignore.
  }
}

// ── Archiving logic ────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Determine whether a single article should be auto-archived under the given
 * rules, relative to `now`. Pure function — no I/O — so we can test exhaustively.
 *
 * Rules:
 *  - Skip anything already archived.
 *  - Unread rule: if the article has no `readAt` and `savedAt` is older than
 *    `unreadAfterDays`, archive it.
 *  - Read rule: if the article has a `readAt` older than `readAfterDays`,
 *    archive it.
 *  - A `null` duration disables that rule.
 */
export function shouldAutoArchive(
  article: {
    savedAt: string;
    readAt: string | null;
    archivedAt: string | null;
  },
  rules: {
    unreadAfterDays: AutoArchiveDays;
    readAfterDays: AutoArchiveDays;
  },
  now: Date,
): boolean {
  if (article.archivedAt) return false;
  const nowMs = now.getTime();

  if (article.readAt) {
    if (rules.readAfterDays === null) return false;
    const readMs = Date.parse(article.readAt);
    if (Number.isNaN(readMs)) return false;
    return nowMs - readMs >= rules.readAfterDays * MS_PER_DAY;
  }

  if (rules.unreadAfterDays === null) return false;
  const savedMs = Date.parse(article.savedAt);
  if (Number.isNaN(savedMs)) return false;
  return nowMs - savedMs >= rules.unreadAfterDays * MS_PER_DAY;
}

/**
 * Archive all articles for a user that match either of the auto-archive rules.
 * Returns the number of articles archived.
 */
export async function runAutoArchiveForUser(
  userId: AuthedUserId,
  rules: {
    unreadAfterDays: AutoArchiveDays;
    readAfterDays: AutoArchiveDays;
  },
  now: Date = new Date(),
): Promise<number> {
  if (rules.unreadAfterDays === null && rules.readAfterDays === null) return 0;

  const inbox = await listArticles(userId, { view: "inbox", state: "all" });
  let archived = 0;
  for (const a of inbox) {
    if (!shouldAutoArchive(a, rules, now)) continue;
    try {
      await setArchived(userId, a.id, true);
      archived++;
    } catch (err) {
      console.error("[auto-archive] failed to archive", {
        userId,
        id: a.id,
        err,
      });
    }
  }
  return archived;
}
