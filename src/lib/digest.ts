import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import type { Volume } from "folio-db-next";
import type { AuthedUserId } from "./auth-types";
import { getFolio, DIGEST_REGISTRY_VOLUME } from "./folio";

// ── Preferences schema ──────────────────────────────────────────────

export interface DigestPreferences {
  enabled: boolean;
  email: string;
  enabledAt: string | null;
}

type DigestFrontmatter = {
  enabled: boolean;
  email: string;
  enabledAt: string | null;
  userId: string;
  lastDigestSentAt: string | null;
  [key: string]: unknown;
};

const digestFrontmatterSchema: z.ZodType<DigestFrontmatter> = z.object({
  enabled: z.boolean(),
  email: z.string().email(),
  enabledAt: z.string().nullable(),
  userId: z.string(),
  lastDigestSentAt: z.string().nullable().default(null),
}) as unknown as z.ZodType<DigestFrontmatter>;

function registryVolume(): Volume<DigestFrontmatter> {
  return getFolio().volume<DigestFrontmatter>(DIGEST_REGISTRY_VOLUME, {
    schema: digestFrontmatterSchema,
  });
}

// Stable slug for a userId inside the registry volume — same hash as
// volumeNameForUser but without the "user-" prefix, to keep it short.
function slugForUser(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 24);
}

// ── Read / write ────────────────────────────────────────────────────

export async function getDigestPreferences(
  userId: AuthedUserId,
): Promise<DigestPreferences> {
  const page = await registryVolume().get(slugForUser(userId));
  if (!page) return { enabled: false, email: "", enabledAt: null };
  return {
    enabled: page.frontmatter.enabled,
    email: page.frontmatter.email,
    enabledAt: page.frontmatter.enabledAt,
  };
}

export async function setDigestPreferences(
  userId: AuthedUserId,
  opts: { enabled: boolean; email: string },
): Promise<DigestPreferences> {
  const slug = slugForUser(userId);
  const vol = registryVolume();

  if (!opts.enabled) {
    // Remove from registry when disabling
    try {
      await vol.delete(slug);
    } catch {
      // Already absent — fine
    }
    return { enabled: false, email: opts.email, enabledAt: null };
  }

  const existing = await vol.get(slug);
  const enabledAt = existing?.frontmatter.enabledAt ?? new Date().toISOString();

  const frontmatter: DigestFrontmatter = {
    enabled: true,
    email: opts.email,
    enabledAt,
    userId,
    lastDigestSentAt: existing?.frontmatter.lastDigestSentAt ?? null,
  };
  await vol.set(slug, { frontmatter, body: "" });
  return { enabled: true, email: opts.email, enabledAt };
}

// ── List all subscribers (for the cron sender) ──────────────────────

export interface DigestSubscriber {
  userId: string;
  email: string;
  lastDigestSentAt: string | null;
}

// ── Unsubscribe tokens ─────────────────────────────────────────────

function unsubscribeSecret(): string {
  return process.env.CRON_SECRET ?? "broadsheet-unsubscribe-fallback";
}

export function generateUnsubscribeToken(userId: string): string {
  return createHmac("sha256", unsubscribeSecret())
    .update(userId)
    .digest("hex")
    .slice(0, 32);
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = generateUnsubscribeToken(userId);
  if (expected.length !== token.length) return false;
  // Constant-time comparison
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function listDigestSubscribers(): Promise<DigestSubscriber[]> {
  const pages = await registryVolume().list();
  return pages
    .filter((p) => p.frontmatter.enabled)
    .map((p) => ({
      userId: p.frontmatter.userId,
      email: p.frontmatter.email,
      lastDigestSentAt: p.frontmatter.lastDigestSentAt ?? null,
    }));
}

export async function markDigestSent(userId: string): Promise<void> {
  const slug = slugForUser(userId);
  await registryVolume().patch(slug, {
    frontmatter: { lastDigestSentAt: new Date().toISOString() },
  });
}
