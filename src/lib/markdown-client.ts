/**
 * Client-side markdown rendering for offline article display.
 *
 * Uses the same marked + DOMPurify pipeline as the server, but relies on the
 * browser's native DOM instead of jsdom. Sanitization config is shared via
 * sanitize-config.ts to prevent security-critical drift.
 */

import { marked } from "marked";
import DOMPurify from "dompurify";
import { SANITIZE_CONFIG } from "./sanitize-config";

// After sanitization, force external links to open in a new tab safely.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    const href = node.getAttribute("href") ?? "";
    if (href.startsWith("http://") || href.startsWith("https://")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noreferrer noopener");
    }
  }
});

export function renderMarkdownClient(md: string): string {
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
