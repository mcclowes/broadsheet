/**
 * Server-side HTML sanitization for article content at save time.
 * Uses the same DOMPurify config and hooks as markdown.ts to ensure
 * consistent sanitization whether we store HTML or render markdown.
 */
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { SANITIZE_CONFIG } from "./sanitize-config";

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

// Force external links to open in a new tab safely.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    const href = node.getAttribute("href") ?? "";
    if (href.startsWith("http://") || href.startsWith("https://")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noreferrer noopener");
    }
  }
});

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
