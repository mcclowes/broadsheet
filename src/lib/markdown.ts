import { marked } from "marked";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const DOMPurify = createDOMPurify(new JSDOM("").window);

marked.setOptions({
  gfm: true,
  breaks: false,
});

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "span",
    "em",
    "strong",
    "code",
    "pre",
    "kbd",
    "samp",
    "var",
    "a",
    "img",
    "figure",
    "figcaption",
    "picture",
    "source",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "hr",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "sub",
    "sup",
    "mark",
    "del",
    "ins",
  ],
  ALLOWED_ATTR: [
    "href",
    "title",
    "src",
    "alt",
    "srcset",
    "sizes",
    "loading",
    // Table semantics: markdown tables inherit alignment via `align`, and
    // headerless tables are preserved as raw HTML which may use colspan /
    // rowspan / scope. None of these are vectors for script execution.
    "align",
    "colspan",
    "rowspan",
    "scope",
  ],
  // DOMPurify applies ALLOWED_URI_REGEXP to every attribute value unless the
  // attribute is flagged URI-safe. Table layout attrs have non-URI values
  // ("row", "2", ...) which would otherwise be stripped.
  ADD_URI_SAFE_ATTR: ["align", "colspan", "rowspan", "scope"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
};

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
