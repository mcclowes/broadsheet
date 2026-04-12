import { createHash } from "node:crypto";
import type { AuthedUserId } from "./auth-types";
import { DIGEST_REGISTRY_VOLUME, getFolio, volumeNameForUser } from "./folio";

const PER_USER_VOLUME_SUFFIXES = [undefined, "sources"] as const;

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
  const registry = getFolio().volume(DIGEST_REGISTRY_VOLUME);
  const digestSlug = createHash("sha256")
    .update(userId)
    .digest("hex")
    .slice(0, 24);
  try {
    await registry.delete(digestSlug);
  } catch {
    // Already absent — idempotent delete
  }
}
