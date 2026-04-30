/**
 * Client-side markdown rendering for offline article display.
 *
 * Uses the same marked + DOMPurify pipeline as the server, but relies on the
 * browser's native DOM instead of jsdom. Sanitization config is shared via
 * sanitize-config.ts to prevent security-critical drift.
 */

import { marked } from "marked";
import DOMPurify from "dompurify";
import { SANITIZE_CONFIG, safeExternalLinkHook } from "./sanitize-config";

// dompurify >= 3.4.1 returns a factory shim (no `addHook` / `sanitize`) when
// loaded outside a browser. This module is "use client" only at runtime, but
// Next.js still evaluates it during prerender of pages that import it (e.g.
// /offline). Register the hook lazily on first call so the module can be
// imported server-side without crashing.
let hookRegistered = false;

export function renderMarkdownClient(md: string): string {
  if (!hookRegistered) {
    DOMPurify.addHook("afterSanitizeAttributes", safeExternalLinkHook);
    hookRegistered = true;
  }
  const html = marked.parse(md, { async: false, gfm: true, breaks: false });
  if (typeof html !== "string") {
    throw new Error("marked.parse returned a non-string (async mode leak)");
  }
  return DOMPurify.sanitize(html, {
    ...SANITIZE_CONFIG,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}
