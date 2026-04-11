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
// volume name.
export function volumeNameForUser(userId: string): string {
  const hex = createHash("sha256").update(userId).digest("hex").slice(0, 24);
  return `user-${hex}`;
}
