import { createHash } from "node:crypto";
import type { AuthedUserId } from "./auth-types";
import {
  AUTO_ARCHIVE_REGISTRY_VOLUME,
  DIGEST_REGISTRY_VOLUME,
  getFolio,
  volumeNameForUser,
} from "./folio";

const PER_USER_VOLUME_SUFFIXES = [undefined, "sources"] as const;

// Registry volumes that store one entry per user, keyed by the same 24-hex
// userId hash used by volumeNameForUser.
const USER_REGISTRY_VOLUMES = [
  DIGEST_REGISTRY_VOLUME,
  AUTO_ARCHIVE_REGISTRY_VOLUME,
] as const;

async function clearVolume(name: string): Promise<void> {
  const vol = getFolio().volume(name);
  const pages = await vol.list();
  for (const page of pages) {
    await vol.delete(page.slug);
  }
}

export async function deleteAllUserData(userId: AuthedUserId): Promise<void> {
  for (const suffix of PER_USER_VOLUME_SUFFIXES) {
    await clearVolume(volumeNameForUser(userId, suffix));
  }
  const slug = createHash("sha256").update(userId).digest("hex").slice(0, 24);
  for (const volumeName of USER_REGISTRY_VOLUMES) {
    const registry = getFolio().volume(volumeName);
    try {
      await registry.delete(slug);
    } catch {
      // Already absent — idempotent delete
    }
  }
}
