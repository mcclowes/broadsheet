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
  ALLOWED_ATTR: ["href", "title", "src", "alt", "srcset", "sizes", "loading"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
};

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
