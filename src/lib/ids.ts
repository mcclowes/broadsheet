/**
 * Shared id validator for any 128-bit truncated sha256 hex id the app
 * produces — article ids, source ids, user-slug derivations.
 *
 * Extracted so that widening or narrowing the derivation in one place does
 * not silently break validators that happen to share the same shape. Import
 * and call `isValidId(id)` at every route-handler boundary that accepts an
 * id in the path or body.
 */
export const HEX32_ID_RE = /^[a-f0-9]{32}$/;

export function isValidId(id: string): boolean {
  return HEX32_ID_RE.test(id);
}
