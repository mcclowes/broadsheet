import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check that the incoming `Authorization` header matches
 * `Bearer ${CRON_SECRET}`. Returns false when the env var is unset so
 * cron endpoints fail closed in misconfigured environments.
 *
 * Shared by `/api/digest/send` and `/api/auto-archive/run`, both of which
 * sit outside Clerk auth and rely on this bearer check as their only gate.
 */
export function verifyCronBearer(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (!authHeader) return false;

  const expected = `Bearer ${secret}`;
  // `timingSafeEqual` requires equal-length buffers — pad/trim with a
  // length check first so attackers can't use length to shortcut the
  // comparison.
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
