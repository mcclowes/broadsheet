import { createHash } from "node:crypto";
import { createFolio, Folio, type StorageAdapter } from "folio-db-next";
import { MemoryAdapter } from "folio-db-next/adapters/memory";
import { FsAdapter } from "folio-db-next/adapters/fs";
import { VercelBlobAdapter } from "folio-db-next/adapters/blob";

let adapter: StorageAdapter | null = null;
let folio: Folio | null = null;

function resolveAdapter(): StorageAdapter {
  if (adapter) return adapter;

  if (process.env.BROADSHEET_FOLIO_ADAPTER === "memory") {
    adapter = new MemoryAdapter();
    return adapter;
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    adapter = new VercelBlobAdapter({
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return adapter;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required in production. Falling back to local disk would lose user data on every cold start.",
    );
  }

  const baseDir = process.env.BROADSHEET_FS_DIR ?? ".broadsheet-data";
  adapter = new FsAdapter({ baseDir });
  return adapter;
}

export function getFolio(): Folio {
  if (!folio) folio = createFolio({ adapter: resolveAdapter() });
  return folio;
}

// Volume names must match [a-z0-9][a-z0-9_-]*. Clerk user IDs can include
// uppercase and other characters, so we hash them into a stable, slug-safe
// volume name. An optional suffix (e.g. "sources") keeps related per-user
// volumes alongside the main article store.
//
// Hash truncation policy:
// - Volume names: 24 hex chars (96 bits) — collision at ~2^48 users, fine
//   for a consumer app.
// - Article IDs (articleIdForUrl): 32 hex chars (128 bits) — tighter budget
//   because one user may store thousands of URLs.
// Both use SHA-256 so the full hash is always available if we need to widen.
export function volumeNameForUser(userId: string, suffix?: string): string {
  const hex = createHash("sha256").update(userId).digest("hex").slice(0, 24);
  const base = `user-${hex}`;
  if (!suffix) return base;
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(suffix)) {
    throw new Error(`Invalid volume suffix: ${suffix}`);
  }
  return `${base}-${suffix}`;
}

// Central registry volume for digest subscribers. One document per opted-in
// user, keyed by the hashed userId (same hex as volumeNameForUser).
export const DIGEST_REGISTRY_VOLUME = "digest-registry";
