import { marked } from "marked";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { SANITIZE_CONFIG } from "./sanitize-config";

const DOMPurify = createDOMPurify(new JSDOM("").window);

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: false });
  if (typeof html !== "string") {
    throw new Error("marked.parse returned a non-string (async mode leak)");
  }
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
