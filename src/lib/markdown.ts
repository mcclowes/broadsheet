import { marked } from "marked";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { SANITIZE_CONFIG } from "./sanitize-config";

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

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

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: false });
  if (typeof html !== "string") {
    throw new Error("marked.parse returned a non-string (async mode leak)");
  }
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
