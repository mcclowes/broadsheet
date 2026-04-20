import { createHash } from "node:crypto";
import type { AuthedUserId } from "./auth-types";
import {
  AUTO_ARCHIVE_REGISTRY_VOLUME,
  DIGEST_REGISTRY_VOLUME,
  getFolio,
  volumeNameForUser,
} from "./folio";

const PER_USER_VOLUME_SUFFIXES = [undefined, "sources", "annotations"] as const;

// Registry volumes that store one entry per user, keyed by the same 24-hex
// userId hash used by volumeNameForUser.
const USER_REGISTRY_VOLUMES = [
  DIGEST_REGISTRY_VOLUME,
  AUTO_ARCHIVE_REGISTRY_VOLUME,
] as const;

export class UserDeletionPartialError extends Error {
  constructor(readonly failures: Array<{ resource: string; error: unknown }>) {
    super(
      `User deletion partially failed (${failures.length} resource(s) failed)`,
    );
    this.name = "UserDeletionPartialError";
  }
}

async function clearVolume(
  name: string,
  failures: Array<{ resource: string; error: unknown }>,
): Promise<void> {
  const vol = getFolio().volume(name);
  let pages;
  try {
    pages = await vol.list();
  } catch (err) {
    failures.push({ resource: `${name}:list`, error: err });
    console.error("[user-deletion] list failed", { volume: name, err });
    return;
  }
  for (const page of pages) {
    try {
      await vol.delete(page.slug);
    } catch (err) {
      // Keep going — one bad page shouldn't block the rest of the user's
      // data being cleared. We collect failures and throw at the end so
      // Svix will retry.
      failures.push({ resource: `${name}:${page.slug}`, error: err });
      console.error("[user-deletion] delete failed", {
        volume: name,
        slug: page.slug,
        err,
      });
    }
  }
}

/**
 * Idempotent per-user deletion. Clears every per-user volume and registry
 * entry tied to `userId`. If *any* delete fails, logs the failure and
 * continues so a single transient error on one page doesn't strand the
 * rest of the user's data; then throws `UserDeletionPartialError` so the
 * caller (the Clerk webhook) returns a 5xx and Svix retries.
 */
export async function deleteAllUserData(userId: AuthedUserId): Promise<void> {
  const failures: Array<{ resource: string; error: unknown }> = [];

  for (const suffix of PER_USER_VOLUME_SUFFIXES) {
    await clearVolume(volumeNameForUser(userId, suffix), failures);
  }

  const slug = createHash("sha256").update(userId).digest("hex").slice(0, 24);
  for (const volumeName of USER_REGISTRY_VOLUMES) {
    const registry = getFolio().volume(volumeName);
    try {
      await registry.delete(slug);
    } catch (err) {
      // A NotFoundError here is expected — user had no entry. Distinguish
      // that from other errors so we don't flag it as a failure.
      const code = (err as { name?: string })?.name;
      if (code === "NotFoundError") continue;
      failures.push({ resource: `${volumeName}:${slug}`, error: err });
      console.error("[user-deletion] registry delete failed", {
        volume: volumeName,
        slug,
        err,
      });
    }
  }

  if (failures.length > 0) {
    throw new UserDeletionPartialError(failures);
  }
}
