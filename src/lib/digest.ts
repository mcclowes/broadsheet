import { createHash } from "node:crypto";
import { z } from "zod";
import type { Volume } from "folio-db-next";
import { getFolio, DIGEST_REGISTRY_VOLUME } from "./folio";

// ── Preferences schema ──────────────────────────────────────────────

export interface DigestPreferences {
  enabled: boolean;
  email: string;
  enabledAt: string | null;
}

const digestFrontmatterSchema = z.object({
  enabled: z.boolean(),
  email: z.string().email(),
  enabledAt: z.string().nullable(),
  userId: z.string(),
});

type DigestFrontmatter = z.infer<typeof digestFrontmatterSchema>;

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
  userId: string,
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
  userId: string,
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
  };
  await vol.set(slug, { frontmatter, body: "" });
  return { enabled: true, email: opts.email, enabledAt };
}

// ── List all subscribers (for the cron sender) ──────────────────────

export interface DigestSubscriber {
  userId: string;
  email: string;
}

export async function listDigestSubscribers(): Promise<DigestSubscriber[]> {
  const pages = await registryVolume().list();
  return pages
    .filter((p) => p.frontmatter.enabled)
    .map((p) => ({
      userId: p.frontmatter.userId,
      email: p.frontmatter.email,
    }));
}
