import { marked } from "marked";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { SANITIZE_CONFIG, safeExternalLinkHook } from "./sanitize-config";

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

DOMPurify.addHook("afterSanitizeAttributes", safeExternalLinkHook);

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: false });
  if (typeof html !== "string") {
    throw new Error("marked.parse returned a non-string (async mode leak)");
  }
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

// Walk the rendered article's DOM the way the client annotator does — a
// TreeWalker over SHOW_TEXT nodes under the article root — so offsets
// computed here anchor to the same positions the browser would produce.
// Used by /api/articles when the extension attaches a context-menu selection.
export function articlePlaintext(markdown: string): string {
  const html = renderMarkdown(markdown);
  const dom = new JSDOM(`<article>${html}</article>`);
  const doc = dom.window.document;
  const root = doc.querySelector("article");
  if (!root) return "";
  const walker = doc.createTreeWalker(root, dom.window.NodeFilter.SHOW_TEXT);
  let out = "";
  let node: Node | null = walker.nextNode();
  while (node) {
    out += node.textContent ?? "";
    node = walker.nextNode();
  }
  return out;
}
